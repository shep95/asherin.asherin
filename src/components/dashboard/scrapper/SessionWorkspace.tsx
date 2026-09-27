import { useState, useEffect, useCallback, useRef } from "react";
import { Upload, Download, Copy, Check, Loader2, Trash2, FileText, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import type { ScrapperSession, ScrapperFile } from "./FileScrapperView";

interface Props {
  session: ScrapperSession;
  onUpdate: () => void;
}

const SessionWorkspace = ({ session, onUpdate }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { copy, copied } = useCopyToClipboard();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<ScrapperFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(true);

  const fetchFiles = useCallback(async () => {
    const { data, error } = await supabase
      .from("scrapper_files")
      .select("*")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true });
    if (!error) setFiles(data || []);
    setLoadingFiles(false);
  }, [session.id]);

  useEffect(() => {
    setLoadingFiles(true);
    fetchFiles();
  }, [fetchFiles]);

  const combinedText = files
    .filter((f) => f.extracted_text)
    .map((f) => `=== ${f.file_name} ===\n${f.extracted_text}`)
    .join("\n\n");

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || !user) return;

    setUploading(true);
    try {
      for (const file of Array.from(selectedFiles)) {
        const storagePath = `${user.id}/${session.id}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("scrapper-uploads")
          .upload(storagePath, file);

        if (uploadError) {
          toast({ title: "Upload failed", description: `${file.name}: ${uploadError.message}`, variant: "destructive" });
          continue;
        }

        const { data: fileRow, error: insertError } = await supabase
          .from("scrapper_files")
          .insert({
            user_id: user.id,
            session_id: session.id,
            file_name: file.name,
            file_size: file.size,
            file_type: file.type || "unknown",
            storage_path: storagePath,
            status: "uploaded",
          })
          .select()
          .single();

        if (insertError) {
          toast({ title: "Error", description: insertError.message, variant: "destructive" });
          continue;
        }

        if (fileRow) {
          setFiles((prev) => [...prev, fileRow]);
          // Auto-extract text
          extractText(fileRow);
        }
      }
      onUpdate();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const extractText = async (file: ScrapperFile) => {
    setExtracting(file.id);
    try {
      // Read the file from storage as base64
      const { data: fileBlob, error: dlError } = await supabase.storage
        .from("scrapper-uploads")
        .download(file.storage_path);

      if (dlError || !fileBlob) throw new Error(dlError?.message || "Download failed");

      const arrayBuffer = await fileBlob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );

      const { data, error } = await supabase.functions.invoke("scrapper-extract", {
        body: {
          fileId: file.id,
          fileName: file.file_name,
          fileType: file.file_type,
          fileBase64: base64,
          sessionId: session.id,
        },
      });

      if (error) throw error;

      const extracted = data?.extractedText || "";
      // Update local state
      setFiles((prev) =>
        prev.map((f) =>
          f.id === file.id ? { ...f, extracted_text: extracted, status: "completed" } : f
        )
      );
      onUpdate();
    } catch (err) {
      toast({
        title: "Extraction failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
      setFiles((prev) =>
        prev.map((f) => (f.id === file.id ? { ...f, status: "failed" } : f))
      );
    } finally {
      setExtracting(null);
    }
  };

  const deleteFile = async (fileId: string) => {
    const file = files.find((f) => f.id === fileId);
    if (file) {
      await supabase.storage.from("scrapper-uploads").remove([file.storage_path]);
    }
    await supabase.from("scrapper_files").delete().eq("id", fileId);
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    onUpdate();
  };

  const downloadTxt = () => {
    const blob = new Blob([combinedText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session.name.replace(/\s+/g, "_")}_extracted.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/10 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-light tracking-wide text-foreground">{session.name}</h2>
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">
            {files.length} file{files.length !== 1 ? "s" : ""} · {(combinedText.length / 1000).toFixed(1)}k characters extracted
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            disabled={!combinedText}
            className="flex items-center gap-1.5 rounded-lg border border-border/15 px-3 py-1.5 text-[10px] font-light text-foreground/70 hover:bg-foreground/5 transition-colors disabled:opacity-30"
          >
            <Eye className="h-3 w-3" />
            Preview
          </button>
          <button
            onClick={() => copy(combinedText)}
            disabled={!combinedText}
            className="flex items-center gap-1.5 rounded-lg border border-border/15 px-3 py-1.5 text-[10px] font-light text-foreground/70 hover:bg-foreground/5 transition-colors disabled:opacity-30"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy All"}
          </button>
          <button
            onClick={downloadTxt}
            disabled={!combinedText}
            className="flex items-center gap-1.5 rounded-lg bg-accent text-accent-foreground px-3 py-1.5 text-[10px] font-light hover:bg-accent/90 transition-colors disabled:opacity-30"
          >
            <Download className="h-3 w-3" />
            Download TXT
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Files list */}
        <div className={`${showPreview ? "w-1/2" : "flex-1"} overflow-y-auto p-6 space-y-3 transition-all`}>
          {/* Upload zone */}
          <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/20 hover:border-accent/30 bg-card/5 p-8 cursor-pointer transition-colors group">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="*/*"
              onChange={handleUpload}
              className="hidden"
            />
            {uploading ? (
              <Loader2 className="h-8 w-8 text-accent animate-spin" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground/30 group-hover:text-accent/60 transition-colors" />
            )}
            <p className="text-xs font-extralight text-muted-foreground/50 mt-3">
              {uploading ? "Uploading…" : "Drop files or click to upload"}
            </p>
            <p className="text-[9px] text-muted-foreground/30 mt-1">
              PDFs, images, documents — any file with text
            </p>
          </label>

          {loadingFiles && (
            <p className="text-[10px] text-muted-foreground/40 text-center animate-pulse">Loading files…</p>
          )}

          {/* File cards */}
          {files.map((file) => (
            <div
              key={file.id}
              className="rounded-lg border border-border/10 bg-card/5 p-4 flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-lg bg-foreground/[0.04] flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-muted-foreground/50" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-light text-foreground truncate">{file.file_name}</p>
                <p className="text-[9px] text-muted-foreground/40 mt-0.5">
                  {(file.file_size / 1024).toFixed(1)} KB · {file.status}
                  {file.extracted_text
                    ? ` · ${file.extracted_text.length.toLocaleString()} chars`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {file.status === "failed" && (
                  <button
                    onClick={() => extractText(file)}
                    className="text-[9px] text-accent hover:underline"
                  >
                    Retry
                  </button>
                )}
                {extracting === file.id && (
                  <Loader2 className="h-3.5 w-3.5 text-accent animate-spin" />
                )}
                <button
                  onClick={() => deleteFile(file.id)}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground/40 hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Preview panel */}
        {showPreview && (
          <div className="w-1/2 border-l border-border/10 overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-light tracking-[0.12em] uppercase text-foreground/80">
                Extracted Text Preview
              </h3>
              <button
                onClick={() => copy(combinedText)}
                className="text-[9px] text-accent hover:underline"
              >
                {copied ? "Copied!" : "Copy all"}
              </button>
            </div>
            {combinedText ? (
              <pre className="text-xs font-mono font-extralight text-foreground/80 whitespace-pre-wrap leading-relaxed bg-background/30 rounded-lg p-4 border border-border/10">
                {combinedText}
              </pre>
            ) : (
              <p className="text-[10px] text-muted-foreground/40 text-center py-12">
                No text extracted yet. Upload files to begin.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionWorkspace;
