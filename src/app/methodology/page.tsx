import Link from "next/link";
export default function Methodology() {
  return (
    <main className="content-page prose-page">
      <div className="page-heading">
        <h1>
          Show the evidence.
          <br />
          Keep the uncertainty.
        </h1>
        <p>
          How NIMBYWatch makes planning records easier to explore without
          claiming more than they tell us.
        </p>
      </div>
      <section className="paper-section">
        <h2>One borough. A defined sample.</h2>
        <p>
          We start with Camden’s public planning applications dataset. The
          initial snapshot contains 176 real residential-related applications,
          selected from the 300 most recently registered records matching
          residential terms, then screened conservatively. It includes
          alterations and changes to existing homes, as well as new
          developments. It is not a census of proposed new housing.
        </p>
        <p>
          Records are keyed by authority and planning reference. Repeat imports
          update existing records. Registration dates, council status and
          decision text are preserved. The source is updated daily; NIMBYWatch
          refreshes when an operator runs ingestion. “Imported” is not a promise
          of real-time coverage.
        </p>
        <p>
          <a href="https://opendata.camden.gov.uk/Environment/Planning-Applications/2eiu-s2cw">
            Camden Planning Applications dataset
          </a>{" "}
          ·{" "}
          <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">
            Open Government Licence v3.0
          </a>
          . Contains public sector information licensed under the Open
          Government Licence v3.0. Source: London Borough of Camden. Contains OS
          data © Crown copyright and database right 2026.
        </p>
      </section>
      <section className="paper-section">
        <h2 id="housing-evidence">What the map and numbers mean</h2>
        <p>
          Map locations are approximate postcode centroids as described by the
          dataset; they are not site boundaries. Nearby applications may share a
          point. Clusters show record counts and split as you zoom. Missing
          coordinates leave an application in the list.
        </p>
        <p>
          Housing numbers have three evidence levels.{" "}
          <strong>Source-reported</strong> means an explicit structured council
          field. <strong>AI-extracted</strong> means an explicit number in a
          source description or authorised document, with its exact supporting
          passage. <strong>Unknown</strong> means the measure cannot be
          established reliably. Camden does not supply the structured unit
          fields, but an explicit proposal such as “1 x self-contained
          residential dwelling” can support one proposed home.
        </p>
        <p>
          Each measure is separate. One proposed home does not establish net
          additional, affordable or approved homes. We do not infer totals from
          bedrooms, existing homes, incidental numbers, earlier permissions or
          an approval status. Only high-confidence, quote-validated extractions
          contribute. Conflicting extractions remain unknown; changes to a
          source description invalidate earlier extraction. Structured council
          values take precedence when available.
        </p>
        <p>
          Description-derived counts are labelled AI-extracted and not
          editorially reviewed, with the source, model and processing date
          available. These narrow numerical findings do not publish general
          document-analysis drafts. Housing findings from authorised documents
          contribute only after their existing publication review. The dashboard
          and size filters use the same resolved counts; coverage separates
          source-reported, AI-extracted and unknown records. Partial sums count
          applications, not unique homes or sites, and must not be used as
          borough housing supply estimates.
        </p>
        <p>
          Outcomes describe the council record. Permission is not proof of
          construction. A refusal is not proof of a lost housing opportunity.
          Applications can be revised, withdrawn, appealed or duplicated, and
          those histories are not yet linked.
        </p>
      </section>
      <section className="paper-section">
        <h2>AI analysis, with an evidence trail</h2>
        <p>
          Authorised operators submit text or a text file with a document title,
          source link and document type. Page references appear only when
          supplied page breaks establish them. Every extracted claim must
          include a source passage; quotations are checked against the submitted
          text.
        </p>
        <p>
          Resident objections, officer assessments and formal decision notices
          are analysed separately. A resident’s view does not become an officer
          finding. An officer recommendation does not become a formal decision.
          Co-occurrence does not establish that an objection caused a refusal.
        </p>
        <p>
          AI output is an interpretation, not legal advice or a legal finding.
          It can omit context or misclassify evidence. General document-analysis
          drafts stay private until an operator checks the original, confirms
          publication rights and checks for personal information.
          Objection-analysis coverage counts only reviewed, published evidence;
          numerical housing extraction has its own coverage.
        </p>
      </section>
      <section className="paper-section">
        <h2>Access, rights and privacy</h2>
        <p>
          Camden’s planning portal restricts copying submitted documents.
          NIMBYWatch links to the council record; it does not scrape or
          republish planning drawings. Manual analysis requires the operator to
          have the necessary rights to submit and publish excerpts, and to
          remove resident names, contact details and other personal information
          before submission.
        </p>
        <p>
          The GLA Planning London Datahub guest API was checked, but its data is
          not ingested in this MVP because applicable reuse conditions were not
          verified. Adding a source is a provenance decision as well as a
          technical task.
        </p>
        <p>
          The interactive basemap uses Mapbox when configured. Local checkouts
          without a token use MapLibre with CARTO vector basemaps and
          OpenStreetMap attribution. These providers receive normal map
          requests.
        </p>
      </section>
      <Link className="primary-link" href="/">
        Explore the records
      </Link>
    </main>
  );
}
