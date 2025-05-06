import {
  ContentType,
  ContentTypeCollection,
  ContentTypeField,
  createClient,
} from 'contentful';
import { writeFileSync } from 'node:fs';
import { join } from 'path';
import 'dotenv/config';

let ctfValidatorsOutput =
  '/* eslint-disable */\n// @ts-nocheck TS2454\n\n// This file is auto-generated\n' +
  'import { z } from "zod";\n' +
  "import type { EntrySkeletonType } from 'contentful'\n\n" +
  'const CFAsset = z.object({ fields: z.object({ file: z.object({ url: z.string() }) }) })\n\n';

export async function generateContentfulSchemas(): Promise<void> {
  const contentfulClient = createClient({
    space: process.env.CONTENTFUL_SPACE_ID || '',
    accessToken: process.env.CONTENTFUL_ACCESS_TOKEN || '',
    environment: process.env.CONTENTFUL_ENVIRONMENT || 'master',
  });

  const validatorsPath = join(
    __dirname,
    '../src/lib/utils/generated/ctf-schemas.ts'
  );

  const collection = await contentfulClient.getContentTypes();

  if (collection.items.length === 0) {
    console.log('No content types found');
    return;
  }

  for (const item of collection.items) {
    console.log(`Generating content model for ${item.name}`);
    generateSchemaForContentType(item);
  }

  generateContentTypeParserMap(collection);
  generateExportsForContentTypes(collection.items);

  writeFileSync(validatorsPath, ctfValidatorsOutput, { encoding: 'utf-8' });
  console.log(
    `Generated ${collection.items.length} content models to ${validatorsPath}`
  );
}

function generateSchemaNameFromContentType(name: string): string {
  return (
    'CF' +
    name
      .split(/\W+/)
      .map(word => word[0].toUpperCase() + word.slice(1))
      .join('')
  );
}

function getSchemaNameFromContentTypeObject(contentType: ContentType): string {
  return generateSchemaNameFromContentType(contentType.name);
}

function resolveLinkedEntitySchemaType(
  type: string | undefined,
  field: ContentTypeField | undefined
): string | undefined {
  if (!field) return undefined;

  switch (type) {
    case 'Entry':
      const linkedItem = field?.items?.validations
        .at(0)
        ?.linkContentType?.at(0);
      if (!linkedItem) return undefined;
      return `z.object({ fields: z.lazy(() => ${generateSchemaNameFromContentType(linkedItem)}) })`;
    case 'Asset':
      return 'CFAsset';
  }
}

function resolveArrayFieldSchemaType(
  field: ContentTypeField | undefined
): string | undefined {
  switch (field?.items?.type) {
    case 'Symbol':
      return 'z.string()';
    case 'Link':
      if (!field?.items?.linkType) return undefined;

      return resolveLinkedEntitySchemaType(field.items.linkType, field);
  }
  return undefined;
}

function mapContentfulFieldToZodType(
  field: ContentTypeField
): string | undefined {
  switch (field.type) {
    case 'Link':
      return resolveLinkedEntitySchemaType(field.linkType, field);
    case 'Text':
    case 'Symbol':
      return 'z.string()';
    case 'Integer':
    case 'Number':
      return 'z.number()';
    case 'Date':
      return 'date()';
    case 'Boolean':
      return 'z.boolean()';
    case 'Array':
      if (!field.items) return undefined;

      const type = resolveArrayFieldSchemaType(field);

      if (!type) return undefined;
      return `z.array(${type})`;
  }

  return undefined;
}

function generateSchemaForContentType(contentType: ContentType) {
  const processedName = getSchemaNameFromContentTypeObject(contentType);
  const fields = contentType.fields
    .map(field => {
      const type = mapContentfulFieldToZodType(field);
      if (!type) return '';

      const req = field.required ? '' : '.optional()';

      return `  ${field.id}: ${type}${req},\n`;
    })
    .join('');

  ctfValidatorsOutput += `var ${processedName} = z.object({\n${fields}});\n\ntype ${processedName}Validated = z.infer<typeof ${processedName}>;\ntype ${processedName}InternalType = EntrySkeletonType<${processedName}Validated, '${contentType.sys.id}'>;\n\n`;
}

function generateExportsForContentTypes(contentTypes: ContentType[]) {
  const exports = contentTypes.map(contentType =>
    getSchemaNameFromContentTypeObject(contentType)
  );

  ctfValidatorsOutput += `\nexport { ${exports.join(', ')}, ParserMap }\nexport type { ${exports
    .map(name => `${name}Validated, ${name}InternalType`)
    .join(', ')} }`;
}

function generateContentTypeParserMap(collection: ContentTypeCollection) {
  const types = collection.items
    .map(contentType => {
      const parserName = getSchemaNameFromContentTypeObject(contentType);
      return `  '${contentType.sys.id}': ${parserName},\n`;
    })
    .join('');

  ctfValidatorsOutput += `const ParserMap: Record<string, z.ZodSchema<unknown>> = {\n${types}}\n`;
}

generateContentfulSchemas();
