// Pure Drive-mirror helpers: shape raw Drive API file objects into the only
// fields the network graph is ever allowed to see, and crawl the curated
// root's descendant tree with an injectable fetcher.
//
// Kept separate from bridge.mjs (which owns the Google token refresh and the
// real Drive REST calls) so this is unit-testable without credentials, a
// network, or a live Google account — mirroring the commands.mjs split.
//
// shapeDriveRow only ever reads id/name/mimeType/modifiedTime/webViewLink
// off the input file — owners, permissions, description, content/export
// links, and tokens are never even looked at, let alone copied onto the row.

export const DRIVE_ROOT_FOLDER_ID = "1mx3O7mDvSU5NnIYcmkfgZl-0U87HtiA0";
export const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
export const MAX_DRIVE_NODES = 2000;

export function shapeDriveRow(file, forcedParentId) {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime ?? null,
    parentId: forcedParentId ?? (Array.isArray(file.parents) ? file.parents[0] ?? null : null),
    webViewLink: file.webViewLink ?? null,
  };
}

// fetchFile(id) => Promise<DriveApiFile | null>
// fetchChildren(folderId) => Promise<DriveApiFile[]>
export async function crawlCuratedDriveTree(rootId, { fetchFile, fetchChildren, maxNodes = MAX_DRIVE_NODES }) {
  const root = await fetchFile(rootId);
  if (!root) return [];

  const rows = [shapeDriveRow(root, null)];
  const seen = new Set([root.id]);
  const queue = root.mimeType === DRIVE_FOLDER_MIME_TYPE ? [root.id] : [];

  while (queue.length > 0 && rows.length < maxNodes) {
    const folderId = queue.shift();
    const children = await fetchChildren(folderId);
    for (const child of children) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      rows.push(shapeDriveRow(child, folderId));
      if (child.mimeType === DRIVE_FOLDER_MIME_TYPE) queue.push(child.id);
      if (rows.length >= maxNodes) break;
    }
  }
  return rows;
}
