import { test } from "node:test";
import assert from "node:assert/strict";
import { shapeDriveRow, crawlCuratedDriveTree, DRIVE_FOLDER_MIME_TYPE, MAX_DRIVE_NODES } from "./drive-mirror.mjs";

test("shapeDriveRow keeps only the six safe fields", () => {
  const row = shapeDriveRow(
    { id: "f1", name: "Notes.pdf", mimeType: "application/pdf", modifiedTime: "2026-01-01T00:00:00.000Z", webViewLink: "https://drive.google.com/file/d/f1/view" },
    "root"
  );
  assert.deepEqual(row, {
    id: "f1", name: "Notes.pdf", mimeType: "application/pdf",
    modifiedTime: "2026-01-01T00:00:00.000Z", parentId: "root",
    webViewLink: "https://drive.google.com/file/d/f1/view",
  });
});

test("shapeDriveRow strips owners/permissions/description/content/export links/tokens a caller attaches", () => {
  const row = shapeDriveRow(
    {
      id: "f1", name: "Doc", mimeType: "application/pdf", modifiedTime: null, webViewLink: null,
      owners: [{ emailAddress: "SECRET_OWNER" }],
      permissions: ["SECRET_PERMISSION"],
      description: "SECRET_DESCRIPTION",
      webContentLink: "SECRET_CONTENT_LINK",
      exportLinks: { "application/pdf": "SECRET_EXPORT_LINK" },
      accessToken: "SECRET_TOKEN",
    },
    null
  );
  assert.deepEqual(Object.keys(row).sort(), ["id", "mimeType", "modifiedTime", "name", "parentId", "webViewLink"]);
  const serialized = JSON.stringify(row);
  for (const secret of ["SECRET_OWNER", "SECRET_PERMISSION", "SECRET_DESCRIPTION", "SECRET_CONTENT_LINK", "SECRET_EXPORT_LINK", "SECRET_TOKEN"]) {
    assert.ok(!serialized.includes(secret), `expected ${secret} to be absent from the shaped row`);
  }
});

test("shapeDriveRow falls back to the file's own first parent only when no parent is forced", () => {
  const row = shapeDriveRow({ id: "f1", name: "Doc", mimeType: "application/pdf", parents: ["p1", "p2"] }, null);
  assert.equal(row.parentId, "p1");
});

test("shapeDriveRow defaults missing modifiedTime/webViewLink/parents to null", () => {
  const row = shapeDriveRow({ id: "f1", name: "Doc", mimeType: "application/pdf" }, null);
  assert.equal(row.modifiedTime, null);
  assert.equal(row.webViewLink, null);
  assert.equal(row.parentId, null);
});

test("crawlCuratedDriveTree returns a single row when the root is not a folder", async () => {
  const root = { id: "root", name: "Solo file", mimeType: "application/pdf" };
  const rows = await crawlCuratedDriveTree("root", {
    fetchFile: async (id) => (id === "root" ? root : null),
    fetchChildren: async () => { throw new Error("should never list children of a non-folder root"); },
  });
  assert.deepEqual(rows, [{ id: "root", name: "Solo file", mimeType: "application/pdf", modifiedTime: null, parentId: null, webViewLink: null }]);
});

test("crawlCuratedDriveTree returns [] when the root cannot be fetched", async () => {
  const rows = await crawlCuratedDriveTree("missing-root", {
    fetchFile: async () => null,
    fetchChildren: async () => [],
  });
  assert.deepEqual(rows, []);
});

test("crawlCuratedDriveTree recurses into nested folders and stamps each row's actual parentId, never a guessed one", async () => {
  const tree = {
    root: { id: "root", name: "Root", mimeType: DRIVE_FOLDER_MIME_TYPE },
    children: {
      root: [
        { id: "sub", name: "Sub", mimeType: DRIVE_FOLDER_MIME_TYPE, parents: ["root"] },
        { id: "f1", name: "File1", mimeType: "application/pdf", parents: ["root"] },
      ],
      sub: [{ id: "f2", name: "File2", mimeType: "application/pdf", parents: ["sub"] }],
    },
  };
  const rows = await crawlCuratedDriveTree("root", {
    fetchFile: async (id) => (id === "root" ? tree.root : null),
    fetchChildren: async (folderId) => tree.children[folderId] ?? [],
  });
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(rows.length, 4);
  assert.equal(byId.root.parentId, null);
  assert.equal(byId.sub.parentId, "root");
  assert.equal(byId.f1.parentId, "root");
  assert.equal(byId.f2.parentId, "sub");
});

test("crawlCuratedDriveTree de-dupes a child that appears under more than one listing", async () => {
  const root = { id: "root", name: "Root", mimeType: DRIVE_FOLDER_MIME_TYPE };
  const shared = { id: "shared", name: "Shared", mimeType: "application/pdf", parents: ["root"] };
  const rows = await crawlCuratedDriveTree("root", {
    fetchFile: async () => root,
    // Simulate the same child id being returned twice for the one folder we crawl.
    fetchChildren: async () => [shared, shared],
  });
  assert.equal(rows.filter((r) => r.id === "shared").length, 1);
});

test("crawlCuratedDriveTree stops at the node cap instead of crawling without bound", async () => {
  const root = { id: "root", name: "Root", mimeType: DRIVE_FOLDER_MIME_TYPE };
  const fetchChildren = async (folderId) =>
    Array.from({ length: 10 }, (_, i) => ({
      id: `${folderId}-${i}`, name: `Item ${i}`, mimeType: DRIVE_FOLDER_MIME_TYPE, parents: [folderId],
    }));
  const rows = await crawlCuratedDriveTree("root", { fetchFile: async () => root, fetchChildren, maxNodes: 5 });
  assert.equal(rows.length, 5);
});

test("MAX_DRIVE_NODES default cap is 2000", () => {
  assert.equal(MAX_DRIVE_NODES, 2000);
});
