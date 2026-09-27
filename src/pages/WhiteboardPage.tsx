import Whiteboard from "@/components/whiteboard/Whiteboard";

/**
 * Standalone /whiteboard route — gives the Whiteboard a true full-viewport
 * shell so its h-full/w-full sizing fills the screen.
 */
const WhiteboardPage = () => {
  return (
    <div className="fixed inset-0 h-screen w-screen overflow-hidden bg-background">
      {/* Visually hidden semantic H1 for SEO/a11y; HUD design is unaffected. */}
      <h1 className="sr-only">Asherin Infinite Whiteboard</h1>
      <Whiteboard />
    </div>
  );
};

export default WhiteboardPage;
