import {
  createFileSystemImageCacheStore as createCoreFileSystemImageCacheStore,
  type ImageCacheStore,
} from "@itoshinji/link-preview";

export type FileSystemImageCacheOptions = {
  directory?: string;
  publicPath?: string;
};

const DEFAULT_DIRECTORY = "public/satteri-link-card";
const DEFAULT_PUBLIC_PATH = "/satteri-link-card";

export function createFileSystemImageCacheStore(
  options: FileSystemImageCacheOptions = {},
): ImageCacheStore {
  return createCoreFileSystemImageCacheStore({
    directory: options.directory ?? DEFAULT_DIRECTORY,
    publicPath: options.publicPath ?? DEFAULT_PUBLIC_PATH,
  });
}
