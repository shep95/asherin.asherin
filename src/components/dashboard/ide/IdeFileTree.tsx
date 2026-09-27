import { useState, memo } from "react";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Plus, Trash2, FileCode, FileText, Image, Database, Settings, Pencil, FolderPlus, FilePlus } from "lucide-react";
import IdeDeleteConfirm from "./IdeDeleteConfirm";

export interface IdeFile {
  id: string;
  name: string;
  type: "file" | "folder";
  language?: string;
  content?: string;
  children?: IdeFile[];
  parentId?: string | null;
}

const FILE_ICONS: Record<string, React.ElementType> = {
  tsx: FileCode, ts: FileCode, jsx: FileCode, js: FileCode,
  css: FileText, html: FileText, md: FileText, json: Settings,
  png: Image, jpg: Image, svg: Image,
  sql: Database,
};

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return FILE_ICONS[ext] || File;
}

function getLanguage(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    css: "css", html: "html", json: "json", md: "markdown",
    sql: "sql", py: "python", rs: "rust", go: "go",
  };
  return map[ext] || "plaintext";
}

interface Props {
  files: IdeFile[];
  activeFileId: string | null;
  onSelectFile: (file: IdeFile) => void;
  onCreateFile: (parentId: string | null, name: string, type: "file" | "folder") => void;
  onDeleteFile: (id: string) => void;
  onRenameFile?: (id: string, newName: string) => void;
  onMoveFile?: (fileId: string, targetFolderId: string | null) => void;
}

const TreeNode = memo(function TreeNode({ node, depth, activeFileId, onSelectFile, onRequestDelete, onRenameFile, onCreateInFolder, onDragStart, onDrop }: {
  node: IdeFile; depth: number; activeFileId: string | null;
  onSelectFile: (f: IdeFile) => void; onRequestDelete: (f: IdeFile) => void;
  onRenameFile?: (id: string, newName: string) => void;
  onCreateInFolder?: (folderId: string, type: "file" | "folder") => void;
  onDragStart?: (e: React.DragEvent, file: IdeFile) => void;
  onDrop?: (e: React.DragEvent, targetFolderId: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState(node.name);
  const [dragOver, setDragOver] = useState(false);
  const Icon = node.type === "folder" ? (expanded ? FolderOpen : Folder) : getFileIcon(node.name);
  const isActive = node.id === activeFileId;

  const commitRename = () => {
    if (renameName.trim() && renameName !== node.name) {
      onRenameFile?.(node.id, renameName.trim());
    }
    setRenaming(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (node.type !== "folder") return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (node.type === "folder") {
      setExpanded(true);
      onDrop?.(e, node.id);
    }
  };

  return (
    <div>
      <button
        draggable
        onDragStart={(e) => onDragStart?.(e, node)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => node.type === "folder" ? setExpanded(!expanded) : onSelectFile(node)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (onRenameFile) {
            setRenameName(node.name);
            setRenaming(true);
          }
        }}
        className={`w-full flex items-center gap-1.5 px-2 py-1 text-[11px] font-light rounded-md transition-colors group ${
          dragOver ? "bg-accent/20 ring-1 ring-accent/30" :
          isActive ? "bg-accent/15 text-accent" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.type === "folder" && (
          expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-accent" : "text-muted-foreground/60"}`} />
        {renaming ? (
          <input
            autoFocus
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(false); }}
            onBlur={commitRename}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-transparent text-[11px] font-light outline-none border-b border-accent/30 min-w-0"
          />
        ) : (
          <span className="truncate flex-1 text-left">{node.name}</span>
        )}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {node.type === "folder" && (
            <>
              <span title="New file here">
                <FilePlus
                  onClick={(e) => { e.stopPropagation(); onCreateInFolder?.(node.id, "file"); setExpanded(true); }}
                  className="h-2.5 w-2.5 text-muted-foreground/50 hover:text-foreground"
                />
              </span>
              <span title="New folder here">
                <FolderPlus
                  onClick={(e) => { e.stopPropagation(); onCreateInFolder?.(node.id, "folder"); setExpanded(true); }}
                  className="h-2.5 w-2.5 text-muted-foreground/50 hover:text-foreground"
                />
              </span>
            </>
          )}
          {onRenameFile && !renaming && (
            <Pencil
              onClick={(e) => { e.stopPropagation(); setRenameName(node.name); setRenaming(true); }}
              className="h-2.5 w-2.5 text-muted-foreground/50 hover:text-foreground"
            />
          )}
          <Trash2
            onClick={(e) => { e.stopPropagation(); onRequestDelete(node); }}
            className="h-3 w-3 hover:text-destructive"
          />
        </div>
      </button>
      {node.type === "folder" && expanded && node.children?.map(child => (
        <TreeNode key={child.id} node={child} depth={depth + 1} activeFileId={activeFileId} onSelectFile={onSelectFile} onRequestDelete={onRequestDelete} onRenameFile={onRenameFile} onCreateInFolder={onCreateInFolder} onDragStart={onDragStart} onDrop={onDrop} />
      ))}
    </div>
  );
}, (prev, next) => prev.node.id === next.node.id && prev.node.name === next.node.name && prev.activeFileId === next.activeFileId && prev.depth === next.depth && prev.node.children === next.node.children);

const IdeFileTree = ({ files, activeFileId, onSelectFile, onCreateFile, onDeleteFile, onRenameFile, onMoveFile }: Props) => {
  const [creating, setCreating] = useState<{ type: "file" | "folder"; parentId: string | null } | null>(null);
  const [newName, setNewName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<IdeFile | null>(null);
  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);

  const handleCreate = () => {
    if (!newName.trim() || !creating) return;
    onCreateFile(creating.parentId, newName.trim(), creating.type);
    setNewName("");
    setCreating(null);
  };

  const handleCreateInFolder = (folderId: string, type: "file" | "folder") => {
    setCreating({ type, parentId: folderId });
    setNewName("");
  };

  const handleDragStart = (e: React.DragEvent, file: IdeFile) => {
    setDraggedFileId(file.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = (_e: React.DragEvent, targetFolderId: string | null) => {
    if (draggedFileId && onMoveFile && draggedFileId !== targetFolderId) {
      onMoveFile(draggedFileId, targetFolderId);
    }
    setDraggedFileId(null);
  };

  const handleRootDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleDrop(e, null);
  };

  const createInput = creating && (
    <div className="px-3 py-2 border-b border-border/10" style={creating.parentId ? { paddingLeft: "20px" } : undefined}>
      <div className="flex items-center gap-1.5">
        {creating.type === "folder" ? <Folder className="h-3 w-3 text-muted-foreground/50" /> : <File className="h-3 w-3 text-muted-foreground/50" />}
        <input
          autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(null); }}
          onBlur={handleCreate}
          placeholder={creating.type === "folder" ? "folder name" : "filename.tsx"}
          className="flex-1 bg-transparent text-[11px] font-light text-foreground outline-none placeholder:text-muted-foreground/30 min-w-0"
        />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/20">
        <span className="text-[10px] font-light tracking-widest text-muted-foreground/60 uppercase">Explorer</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setCreating({ type: "file", parentId: null })} className="p-1 rounded text-muted-foreground/50 hover:text-foreground transition-colors" title="New file">
            <Plus className="h-3 w-3" />
          </button>
          <button onClick={() => setCreating({ type: "folder", parentId: null })} className="p-1 rounded text-muted-foreground/50 hover:text-foreground transition-colors" title="New folder">
            <Folder className="h-3 w-3" />
          </button>
        </div>
      </div>

      {creating && !creating.parentId && createInput}

      <div
        className="flex-1 overflow-y-auto py-1"
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={handleRootDrop}
      >
        {files.length === 0 ? (
          <p className="px-3 py-4 text-[10px] text-muted-foreground/40 text-center">No files yet. Create one above.</p>
        ) : (
          files.map(f => (
            <div key={f.id}>
              <TreeNode
                node={f}
                depth={0}
                activeFileId={activeFileId}
                onSelectFile={onSelectFile}
                onRequestDelete={(node) => setDeleteTarget(node)}
                onRenameFile={onRenameFile}
                onCreateInFolder={handleCreateInFolder}
                onDragStart={handleDragStart}
                onDrop={handleDrop}
              />
              {creating && creating.parentId === f.id && createInput}
            </div>
          ))
        )}
      </div>

      <IdeDeleteConfirm
        open={!!deleteTarget}
        fileName={deleteTarget?.name ?? ""}
        onConfirm={() => { if (deleteTarget) onDeleteFile(deleteTarget.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export { getLanguage };
export default IdeFileTree;
