import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  open: boolean;
  fileName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const IdeDeleteConfirm = ({ open, fileName, onConfirm, onCancel }: Props) => (
  <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
    <AlertDialogContent className="bg-background border-border/30 max-w-sm">
      <AlertDialogHeader>
        <AlertDialogTitle className="text-sm font-light tracking-wide">Delete "{fileName}"?</AlertDialogTitle>
        <AlertDialogDescription className="text-xs font-extralight text-muted-foreground">
          This action cannot be undone. The file and its contents will be permanently removed.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel className="text-xs font-light" onClick={onCancel}>Cancel</AlertDialogCancel>
        <AlertDialogAction className="text-xs font-light bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onConfirm}>
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export default IdeDeleteConfirm;
