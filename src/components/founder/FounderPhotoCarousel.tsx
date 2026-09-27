/**
 * The founder frame. One portrait, held still. Ships with the app under
 * public/founder/ so the local edition never reaches for a hosted asset.
 */
const PORTRAIT = "/founder/portrait-1.jpg";

export default function FounderPhotoCarousel() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <img
        src={PORTRAIT}
        alt="Asher Newton, founder of Asherin"
        className="arrive h-full w-full object-cover object-center"
        loading="eager"
        decoding="async"
      />
    </div>
  );
}
