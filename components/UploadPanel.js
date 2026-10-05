import { useRef, useState } from "react";
import Papa from "papaparse";
import styles from "./Dashboard.module.css";
import JokeStats from "./JokeStats";
import {
  MAX_TOPICS_PER_UPLOAD,
  cleanTopic,
  downloadText,
  makeRecord,
  parseRating,
  recordsToCsv,
  topicKey,
} from "../lib/jokeData";

// Accepted spellings for each column (headers are lowercased, spaces become "_")
const TOPIC_COLUMNS = ["topic", "topics", "subject", "category"];
const JOKE_COLUMNS = ["joke", "jokes", "joke_text", "text", "content"];
const RATING_COLUMNS = ["rating", "rate", "vote", "thumbs"];
const TIME_COLUMNS = ["timestamp", "date", "created", "created_at", "time"];

const EXAMPLE_CSV = `topic,joke,rating
Cats,Why did the cat sit on the computer? To keep an eye on the mouse.,up
Pizza,"I was going to tell you a pizza joke, but it's too cheesy.",down
Coffee,How does a coffee bean say goodbye? It espresso-ly leaves.,
Dinosaurs,,`;

const findColumn = (fields, options) => options.find((name) => fields.includes(name));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function UploadPanel({ records, fileName, onReplace, onAddRecords, onRate, onDelete, onClear }) {
  const [status, setStatus] = useState(null); // { type: "error" | "success" | "info", text }
  const [progress, setProgress] = useState(null); // { done, total, current }
  const cancelRef = useRef(false);
  const fileInputRef = useRef(null);
  const busy = progress !== null;

  // Write a joke for each topic-only row, one at a time, adding each as it arrives
  const generateJokes = async (topics) => {
    cancelRef.current = false;
    let added = 0;
    let failed = 0;
    for (let i = 0; i < topics.length && !cancelRef.current; i++) {
      setProgress({ done: i, total: topics.length, current: topics[i] });
      try {
        const response = await fetch("/api/generate?endpoint=single", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: topics[i] }),
        });
        const data = await response.json();
        if (!response.ok || !data.joke) throw new Error(data.error || "No joke returned");
        onAddRecords([makeRecord({ topic: topics[i], joke: data.joke, source: "upload" })]);
        added++;
      } catch (error) {
        console.error(error);
        failed++;
      }
    }
    setProgress(null);
    return { added, failed, stopped: cancelRef.current };
  };

  const handleRows = async (rows, fields, name) => {
    const columns = {
      topic: findColumn(fields, TOPIC_COLUMNS),
      joke: findColumn(fields, JOKE_COLUMNS),
      rating: findColumn(fields, RATING_COLUMNS),
      time: findColumn(fields, TIME_COLUMNS),
    };
    if (!columns.topic) {
      setStatus({
        type: "error",
        text: `This file needs a "topic" column. Found: ${fields.length ? fields.join(", ") : "no columns"}.`,
      });
      return;
    }

    // Rows with a joke are imported as-is; rows with only a topic get a new joke
    const imported = [];
    const topicsToWrite = [];
    const seen = new Set();
    for (const row of rows) {
      const topic = String(row[columns.topic] || "").trim();
      const joke = columns.joke ? String(row[columns.joke] || "").trim() : "";
      if (!topic && !joke) continue;
      if (!joke) {
        topicsToWrite.push(cleanTopic(topic));
        continue;
      }
      const key = `${topicKey(topic)}|${joke}`;
      if (seen.has(key)) continue;
      seen.add(key);
      imported.push(
        makeRecord({
          topic,
          joke,
          rating: columns.rating ? parseRating(row[columns.rating]) : null,
          timestamp: columns.time ? row[columns.time] : undefined,
          source: "upload",
        })
      );
    }

    if (!imported.length && !topicsToWrite.length) {
      setStatus({ type: "error", text: "That file has no rows with a topic or joke." });
      return;
    }

    // A new upload replaces the previous one, so the charts show only this file
    onReplace(imported, name);
    const toWrite = topicsToWrite.slice(0, MAX_TOPICS_PER_UPLOAD);
    const notes = [];
    if (imported.length) notes.push(`Imported ${plural(imported.length, "joke")}.`);
    if (topicsToWrite.length > MAX_TOPICS_PER_UPLOAD) {
      notes.push(`Only the first ${MAX_TOPICS_PER_UPLOAD} of ${topicsToWrite.length} topic-only rows get new jokes.`);
    }
    if (!toWrite.length) {
      setStatus({ type: "success", text: notes.join(" ") });
      return;
    }
    setStatus(notes.length ? { type: "info", text: notes.join(" ") } : null);

    const { added, failed, stopped } = await generateJokes(toWrite);
    notes.push(`Wrote ${plural(added, "new joke")}${stopped ? " (stopped early)" : ""}.`);
    if (failed) notes.push(`${failed} failed.`);
    setStatus({ type: failed && !added && !imported.length ? "error" : "success", text: notes.join(" ") });
  };

  const onFileChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow picking the same file again
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      setStatus({ type: "error", text: `"${file.name}" isn't a .csv file. Please upload a CSV.` });
      return;
    }
    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, "_"),
      error: (error) => setStatus({ type: "error", text: `Couldn't read that file: ${error.message}` }),
      complete: ({ data, meta }) => handleRows(data, meta.fields || [], file.name),
    });
  };

  const downloadData = () =>
    downloadText(`uploaded-jokes-${new Date().toISOString().slice(0, 10)}.csv`, recordsToCsv(records));

  return (
    <section className={styles.panel}>
      <h2 className={styles.sectionTitle}>Upload Data</h2>

      <div className={styles.card}>
        <p className={styles.formatIntro}>Upload a CSV file with these columns:</p>
        <ul className={styles.columnList}>
          <li>
            <code>topic</code> <span className={styles.required}>required</span> what the joke is about
          </li>
          <li>
            <code>joke</code> <span className={styles.optional}>optional</span> the joke text. Leave it blank and
            I'll write one for that topic (up to {MAX_TOPICS_PER_UPLOAD} per file).
          </li>
          <li>
            <code>rating</code> <span className={styles.optional}>optional</span> <code>up</code> or{" "}
            <code>down</code> (👍 / 👎 and 1 / 0 also work)
          </li>
        </ul>
        <p className={styles.formatIntro}>Example:</p>
        <pre className={styles.example}>{EXAMPLE_CSV}</pre>

        <div className={styles.actions}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFileChange}
            className={styles.hiddenInput}
            disabled={busy}
          />
          <button className={styles.primaryButton} disabled={busy} onClick={() => fileInputRef.current?.click()}>
            {records.length ? "Upload a different CSV" : "Choose CSV file"}
          </button>
          <a className={styles.link} href="/example-jokes.csv" download>
            Download example CSV
          </a>
        </div>

        {progress && (
          <div className={styles.progressBox} role="status" aria-live="polite">
            <div className={styles.progressText}>
              <span>
                Writing joke {progress.done + 1} of {progress.total}: <strong>{progress.current}</strong>
              </span>
              <button className={styles.textButton} onClick={() => (cancelRef.current = true)}>
                Stop
              </button>
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
          </div>
        )}

        {status && (
          <p className={styles[status.type]} role={status.type === "error" ? "alert" : "status"}>
            {status.text}
          </p>
        )}
      </div>

      {records.length > 0 && (
        <div className={styles.uploadResults}>
          <JokeStats
            embedded
            records={records}
            title={`Stats for ${fileName || "your upload"}`}
            description="These charts use only the jokes from your uploaded file."
            onRate={onRate}
            onDelete={onDelete}
            actions={
              <>
                <button className={styles.secondaryButton} onClick={downloadData}>
                  Download as CSV
                </button>
                <button
                  className={styles.dangerButton}
                  disabled={busy}
                  onClick={() => {
                    onClear();
                    setStatus(null);
                  }}
                >
                  Clear upload
                </button>
              </>
            }
          />
        </div>
      )}
    </section>
  );
}
