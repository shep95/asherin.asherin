import { Link } from "react-router-dom";
import { MessageSquare } from "lucide-react";

const ForumsDropdown = () => (
  <Link
    to="/forums"
    className="px-4 py-2 sm:py-2.5 flex items-center gap-1.5 text-sm font-light tracking-wide text-muted-foreground transition-colors hover:text-foreground hover:bg-card/80 outline-none rounded-r-xl"
  >
    <MessageSquare className="h-3.5 w-3.5" />
    Forums
  </Link>
);

export default ForumsDropdown;
