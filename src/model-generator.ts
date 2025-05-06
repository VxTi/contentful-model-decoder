import {
  type ContentType,
  type ContentTypeCollection,
  type ContentTypeField,
  createClient,
} from "contentful";
import { mkdirSync, writeFileSync } from "fs";
import { existsSync } from "node:fs";
import { join } from "path";
import type { CtfModelGenerationConfig } from "./index";

type ModelVariant = "decoder" | "type" | "ctf-type";

let ctfValidatorsOutput =
  "/* eslint-disable */\n// @ts-nocheck TS2454\n\n// This file is auto-generated\n" +
  'import { z } from "zod";\n' +
  "import type { EntrySkeletonType } from 'contentful'\n\n" +
  "const CFAsset = z.object({\n  fields: z.object({\n    file: z.object({ url: z.string() }),\n  }),\n});\n\n";

export async function generateContentfulSchemas(
  config: CtfModelGenerationConfig,
): Promise<string> {
  const contentfulClient = createClient({
    space: config.ctfSpaceId,
    accessToken: config.ctfAccessToken,
    environment: config.ctfEnvironment ?? "master",
  });

  const collection = await contentfulClient.getContentTypes();

  if (collection.items.length === 0) return "";

  function schemaNameFromContentType(name: string): string {
    return name
      .split(/\W+/)
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join("");
  }

  function formatVariantName(name: string, variant: ModelVariant): string {
    switch (variant) {
      case "type":
        return name;
      case "decoder":
        return "CF" + name + "Decoder";
      case "ctf-type":
        return "CFType" + name;
    }
  }

  function schemaNameFromContentTypeObject(contentType: ContentType): string {
    return schemaNameFromContentType(contentType.name);
  }

  function resolveLinkedEntitySchemaType(
    type: string | undefined,
    field: ContentTypeField | undefined,
  ): string | undefined {
    if (!field) return undefined;

    switch (type) {
      case "Entry": {
        const linkedRefs = field?.items?.validations.at(0)?.linkContentType;

        if (!linkedRefs || linkedRefs.length === 0) return undefined;

        const refs = linkedRefs.map((ref) =>
          formatVariantName(schemaNameFromContentType(ref), "decoder"),
        );

        if (refs.length === 1)
          return `z.object({\n    fields: z.lazy(() => ${refs.at(0)}),\n  })`;

        return `z.object({\n    fields: z.union([\n      ${refs
          .map((ref) => `z.lazy(() => ${ref})`)
          .join(",\n      ")}\n    ]),\n  })`;
      }
      case "Asset":
        return "CFAsset";
    }
  }

  function resolveArrayFieldSchemaType(
    field: ContentTypeField | undefined,
  ): string | undefined {
    switch (field?.items?.type) {
      case "Symbol":
        return "z.string()";
      case "Link":
        if (!field?.items?.linkType) return undefined;

        return resolveLinkedEntitySchemaType(field.items.linkType, field);
    }
    return undefined;
  }

  function mapContentfulFieldToZodType(
    field: ContentTypeField,
  ): string | undefined {
    switch (field.type) {
      case "Link":
        return resolveLinkedEntitySchemaType(field.linkType, field);
      case "Text":
      case "Symbol":
        return "z.string()";
      case "Integer":
      case "Number":
        return "z.number()";
      case "Date":
        return "date()";
      case "Boolean":
        return "z.boolean()";
      case "Array": {
        if (!field.items) return undefined;

        const type = resolveArrayFieldSchemaType(field);

        if (!type) return undefined;
        return `z.array(${type})`;
      }
    }

    return undefined;
  }

  function generateSchemaForContentType(contentType: ContentType) {
    const processedName = schemaNameFromContentTypeObject(contentType);
    const fields = contentType.fields
      .map((field) => {
        const type = mapContentfulFieldToZodType(field);
        if (!type) return "";

        const req = field.required ? "" : ".optional()";

        return `${field.id}: ${type}${req},`;
      })
      .join("\n  ");

    const decoderName = formatVariantName(processedName, "decoder");
    const typeName = formatVariantName(processedName, "type");
    const ctfTypeName = formatVariantName(processedName, "ctf-type");

    ctfValidatorsOutput += `var ${decoderName} = z.object({\n  ${fields}\n});\n\ntype ${typeName} = z.infer<typeof ${decoderName}>;\ntype ${ctfTypeName} = EntrySkeletonType<${typeName}, '${contentType.sys.id}'>;\n\n`;
  }

  function generateExportsForContentTypes(contentTypes: ContentType[]) {
    const exportNames = contentTypes.map((contentType) =>
      schemaNameFromContentTypeObject(contentType),
    );

    const decoderExports = exportNames.map((name) =>
      formatVariantName(name, "decoder"),
    );
    const otherExports = exportNames.flatMap((name) => [
      formatVariantName(name, "type"),
      formatVariantName(name, "ctf-type"),
    ]);

    ctfValidatorsOutput += `\nexport {\n  ${decoderExports.join(",\n  ")},\n}\nexport type {\n  ${otherExports.join(
      ",\n  ",
    )}\n}`;
  }

  function generateContentTypeParserMap(collection: ContentTypeCollection) {
    const types = collection.items
      .map((contentType) => {
        const parserName = schemaNameFromContentTypeObject(contentType);
        return `  '${contentType.sys.id}': ${parserName},\n`;
      })
      .join("");

    ctfValidatorsOutput += `export const ParserMap: Record<string, z.ZodSchema<unknown>> = {\n${types}}\n`;
  }

  for (const item of collection.items) {
    console.log(`Generating content model for ${item.name}`);
    generateSchemaForContentType(item);
  }

  generateContentTypeParserMap(collection);
  generateExportsForContentTypes(collection.items);

  if (config.output) {
    if (!existsSync(config.output.directory))
      mkdirSync(config.output.directory, { recursive: true });

    const validatorsPath = join(
      config.output?.directory,
      (config.output?.fileName ?? "ctf-schemas") + ".ts",
    );
    writeFileSync(validatorsPath, ctfValidatorsOutput, { encoding: "utf-8" });
    console.log(
      `Generated ${collection.items.length} content models to ${validatorsPath}`,
    );
  }

  return ctfValidatorsOutput;
}
