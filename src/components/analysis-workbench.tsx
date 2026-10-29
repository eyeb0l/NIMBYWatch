"use client";
import { useState } from "react";
import type { Application } from "@/lib/types";
import type { AnalysisRecord } from "@/lib/analysis/service";
import { Evidence } from "./evidence";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
export function AnalysisWorkbench({
  applications,
  initialId,
}: {
  applications: Application[];
  initialId: string;
}) {
  const [applicationId, setApplicationId] = useState(
      initialId || applications[0]?.id || "",
    ),
    [token, setToken] = useState(""),
    [title, setTitle] = useState(""),
    [sourceUrl, setSourceUrl] = useState(""),
    [documentType, setDocumentType] = useState("officer_report"),
    [text, setText] = useState(""),
    [authorized, setAuthorized] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [drafts, setDrafts] = useState<AnalysisRecord[]>([]),
    [checks, setChecks] = useState<Record<string, boolean>>({});
  async function api(url: string, body?: unknown) {
    const response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Request failed");
    return result;
  }
  async function load() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api(
        `/api/analysis?applicationId=${encodeURIComponent(applicationId)}`,
      );
      setDrafts(result.analyses);
      setChecks({});
      setMessage("Private drafts loaded.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not load drafts");
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("Analysing source text. This may take up to a minute…");
    try {
      const result = await api("/api/analysis", {
        applicationId,
        title,
        sourceUrl,
        documentType,
        text,
        authorized,
      });
      setDrafts((d) => [
        result.analysis,
        ...d.filter((a) => a.id !== result.analysis.id),
      ]);
      setMessage(
        result.reused
          ? result.analysis.status === "failed"
            ? "The previous attempt failed. No new API request was made. Check the failure below and the recovery instructions."
            : result.analysis.status === "processing"
              ? "This document is already processing. Load private drafts again shortly; no new API request was made."
              : "Unchanged document: existing analysis reused."
          : "Analysis complete. Review the private draft before publishing.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  }
  async function publish(id: string) {
    const accuracyReviewed = checks[`${id}-0`] === true,
      privacyReviewed = checks[`${id}-1`] === true,
      rightsConfirmed = checks[`${id}-2`] === true;
    if (!accuracyReviewed || !privacyReviewed || !rightsConfirmed) return;
    setBusy(true);
    try {
      const result = await api(`/api/analysis/${id}/review`, {
        privacyReviewed,
        accuracyReviewed,
        rightsConfirmed,
      });
      setDrafts((d) => d.map((a) => (a.id === id ? result.analysis : a)));
      setMessage(
        "Reviewed evidence published. It is now available on the application page.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Publication failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form onSubmit={submit} className="analysis-form paper-section">
        <fieldset
          disabled={busy}
          className="form-grid"
          style={{ border: 0, padding: 0, minWidth: 0 }}
        >
          <label className="full">
            Application
            <select
              value={applicationId}
              onChange={(e) => {
                setApplicationId(e.target.value);
                setDrafts([]);
                setChecks({});
                setMessage("");
              }}
              aria-label="Application"
            >
              {applications.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.reference} — {a.address}
                </option>
              ))}
            </select>
          </label>
          <label>
            Operator token
            <Input
              aria-label="Operator token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setDrafts([]);
                setChecks({});
                setMessage("");
              }}
              required
              placeholder="Private operator access"
            />
            <small>
              Held only in this page’s memory. Never stored in the browser.
            </small>
          </label>
          <label>
            Document type
            <select
              aria-label="Document type"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
            >
              <option value="officer_report">Planning officer report</option>
              <option value="decision_notice">Decision notice</option>
              <option value="representation">
                Consultation representation
              </option>
              <option value="application_description">
                Application description (summary only)
              </option>
            </select>
          </label>
          <label>
            Document title
            <Input
              aria-label="Document title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={3}
              maxLength={250}
            />
          </label>
          <label>
            Original source URL
            <Input
              aria-label="Original source URL"
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              required
              placeholder="https://…"
            />
          </label>
          <label className="full">
            Upload a text document
            <Input
              aria-label="Upload a text document"
              type="file"
              accept=".txt,text/plain"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 120000) {
                  setMessage("File is too large. Maximum 120 KB.");
                  return;
                }
                if (!file.name.toLowerCase().endsWith(".txt")) {
                  setMessage("Choose a plain-text .txt file.");
                  return;
                }
                setBusy(true);
                try {
                  const content = await file.text();
                  if (content.length > 60000 || content.includes("\0")) {
                    setMessage(
                      "Use plain text with at most 60,000 characters.",
                    );
                    return;
                  }
                  setText(content);
                  if (!title) setTitle(file.name);
                  setAuthorized(false);
                  setMessage(
                    "Text loaded. Check privacy and processing permission before analysing.",
                  );
                } catch {
                  setMessage("The text file could not be read.");
                } finally {
                  setBusy(false);
                }
              }}
            />
            <small>
              Plain text only. For PDFs, paste an authorised text transcription.
              Use form-feed page breaks to preserve page references; otherwise
              page numbers stay unknown.
            </small>
          </label>
          <label className="full">
            Source text
            <Textarea
              aria-label="Source text"
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
              minLength={40}
              maxLength={60000}
              placeholder="Paste the source after removing residents’ names, contact details and other personal information."
            />
          </label>
        </fieldset>
        <label className="check-label">
          <input
            type="checkbox"
            disabled={busy}
            required
            checked={authorized}
            onChange={(e) => setAuthorized(e.target.checked)}
          />
          I have permission to process this document and have removed objectors’
          personal information.
        </label>
        <div className="form-actions">
          <Button disabled={busy || !authorized} type="submit">
            {busy ? "Working…" : "Analyse document"}
          </Button>
          <Button
            variant="outline"
            type="button"
            disabled={busy || !token}
            onClick={load}
          >
            Load private drafts
          </Button>
        </div>
        <p role="status" className="form-message">
          {message}
        </p>
      </form>
      {drafts.map((d) => (
        <section key={d.id} className="paper-section">
          <div className="section-top">
            <h2>
              {d.status === "published"
                ? "Published evidence"
                : "Private analysis draft"}
            </h2>
            <span className="fact-label">{d.status.replaceAll("_", " ")}</span>
          </div>
          {!d.result && (
            <p>
              {d.title} · {d.documentType.replaceAll("_", " ")}
            </p>
          )}
          {d.error && <p role="alert">{d.error}</p>}
          <Evidence analysis={d} />
          {d.status === "needs_review" && (
            <div className="review-box">
              <h3>Check before publication</h3>
              <p>
                Compare every conclusion and quotation against the original
                document. Check the source URL, page numbers, publication rights
                and personal information. If a draft is wrong, do not publish
                it; correct or redact the input and analyse it again.
              </p>
              {[
                "Accuracy and context checked against the original",
                "No objector personal information in the output",
                "Rights to publish these excerpts confirmed",
              ].map((label, i) => (
                <label className="check-label" key={label}>
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={checks[`${d.id}-${i}`] ?? false}
                    onChange={(e) =>
                      setChecks({
                        ...checks,
                        [`${d.id}-${i}`]: e.target.checked,
                      })
                    }
                  />
                  {label}
                </label>
              ))}
              <Button
                disabled={
                  busy || ![0, 1, 2].every((i) => checks[`${d.id}-${i}`])
                }
                onClick={() => publish(d.id)}
              >
                Publish reviewed evidence
              </Button>
            </div>
          )}
        </section>
      ))}
    </>
  );
}
