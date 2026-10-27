import { Link } from 'react-router-dom';

type PlaceholderPageProps = {
  eyebrow: string;
  title: string;
  summary: string;
  detail: string;
};

export function PlaceholderPage({ eyebrow, title, summary, detail }: PlaceholderPageProps) {
  return (
    <article className="placeholder-page">
      <p className="eyebrow">
        <span className="eyebrow-rule" /> {eyebrow}
      </p>
      <div className="placeholder-heading-row">
        <h1>{title}</h1>
        <span className="placeholder-badge">Placeholder</span>
      </div>
      <p className="placeholder-summary">{summary}</p>
      <div className="placeholder-boundary" role="note">
        <span className="scope-note-mark" aria-hidden="true">
          i
        </span>
        <p>{detail}</p>
      </div>
      <Link className="text-link" to="/">
        Return to overview <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}

export function ReportPlaceholderPage() {
  return (
    <div className="report-layout">
      <PlaceholderPage
        eyebrow="Public view / 01"
        title="Report an emergency"
        summary="Report intake is not implemented in this foundation stage. Nothing on this page can send or save a report."
        detail="For urgent assistance, use the Call 112 link if telephone service is available. This prototype cannot request or guarantee help."
      />
      <section className="sample-control" aria-labelledby="sample-control-title">
        <p className="eyebrow">
          <span className="eyebrow-rule" /> Accessibility example
        </p>
        <h2 id="sample-control-title">Keyboard-accessible field</h2>
        <p className="sample-explanation">
          This sample is only here to demonstrate an accessible form label. The field is local to
          this page: it is not submitted, transmitted, or saved.
        </p>
        <label htmlFor="local-demo-note">Demonstration note (not sent or saved)</label>
        <input
          id="local-demo-note"
          name="local-demo-note"
          type="text"
          autoComplete="off"
          placeholder="Type here to test keyboard access"
        />
      </section>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <section className="placeholder-page" aria-labelledby="not-found-title">
      <p className="eyebrow">
        <span className="eyebrow-rule" /> Route / 404
      </p>
      <h1 id="not-found-title">Page not found</h1>
      <p className="placeholder-summary">This address is not part of the Stage 1 prototype.</p>
      <Link className="text-link" to="/">
        Return to overview <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
