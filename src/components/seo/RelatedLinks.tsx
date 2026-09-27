/**
 * RelatedLinks — where to read next.
 *
 * every record ends with a small cluster of internal links so a reader (and
 * a crawler) has somewhere to go. a list under a hairline; no cards.
 */
import { Link } from "react-router-dom";

export interface RelatedLink {
  to: string;
  label: string;
  description: string;
}

interface Props {
  heading?: string;
  links: RelatedLink[];
}

const RelatedLinks = ({ heading = "read next", links }: Props) => {
  return (
    <section aria-label="Related Asherin resources" className="not-prose mx-auto mt-20 max-w-[44rem] border-t journal-rule pt-10">
      <h2 className="text-[11px] font-light lowercase tracking-[0.12em] text-foreground/55">{heading}</h2>
      <ul className="mt-4">
        {links.map((l) => (
          <li key={l.to} className="border-b journal-rule last:border-b-0">
            <Link to={l.to} className="group block py-5 focus-visible:outline-none">
              <p className="text-base font-extralight lowercase leading-snug text-foreground transition-colors duration-[var(--dur-settle)] ease-quiet group-hover:text-foreground/65">
                {l.label}
              </p>
              <p className="mt-1.5 text-sm font-light leading-relaxed text-foreground/50">{l.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default RelatedLinks;
