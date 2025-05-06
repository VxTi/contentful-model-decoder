export interface OutputFileConfig {
  /**
   * The directory where the generated files will be written.
   */
  directory: string;

  /**
   * The name of the output file to be generated, excluding the file extension.
   * This is an optional property and will default to `ctf-schema.ts`.
   */
  fileName?: string;
}

export interface CtfModelGenerationConfig {
  ctfAccessToken: string;
  ctfSpaceId: string;

  /**
   * Contentful environment name. If left empty, will default to `master`.
   */
  ctfEnvironment?: string;

  output?: OutputFileConfig;

  /**
   * The content types to generate schemas for.
   * This is an optional property and will default to all content types.
   */
  contentTypes?: string[];

  /**
   * The prefix to use for the generated types.
   * This is an optional property and will default to `CF`.
   */
  typePrefix?: string;
}
