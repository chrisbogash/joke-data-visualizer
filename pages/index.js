import Head from "next/head";
import { useState, useEffect, useRef } from "react";
import styles from "./index.module.css";
import UploadPanel from "../components/UploadPanel";
import JokeStats, { RatingButtons } from "../components/JokeStats";
import dashStyles from "../components/Dashboard.module.css";
import { downloadText, loadRecords, makeRecord, recordsToCsv, saveRecords, topicFromMessage } from "../lib/jokeData";
import { makeSampleRecords } from "../lib/sampleJokes";

const WELCOME = {
  role: "assistant",
  content: "Welcome to the club! Give me any topic and I'll write you a joke about it.",
};

const TOPICS = ["Cats", "Programmers", "Pizza", "College finals", "Dinosaurs"];

const TABS = [
  { id: "chat", label: "🎤 Chat" },
  { id: "session", label: "💬 Session Stats" },
  { id: "upload", label: "📤 Upload Data" },
  { id: "sample", label: "📊 Sample Stats" },
];

// Records kept in browser storage. Each joke is
// { id, topic, joke, wordCount, charCount, timestamp, rating, source }.
// Returns [records, setRecords, saveFailed].
function useStoredRecords(storageType, key) {
  const [records, setRecords] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  // Load once in the browser, then save whenever the records change
  useEffect(() => {
    setRecords(loadRecords(window[storageType], key));
    setLoaded(true);
  }, [storageType, key]);

  useEffect(() => {
    if (loaded) setSaveFailed(!saveRecords(window[storageType], key, records));
  }, [records, loaded, storageType, key]);

  return [records, setRecords, saveFailed];
}

const updateRating = (setRecords) => (id, rating) =>
  setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, rating } : r)));
const removeRecord = (setRecords) => (id) => setRecords((prev) => prev.filter((r) => r.id !== id));

export default function Home() {
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState([WELCOME]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("chat");
  // Three separate datasets: jokes from this session's chat, the uploaded CSV, and built-in sample data
  const [sessionRecords, setSessionRecords, sessionSaveFailed] = useStoredRecords("sessionStorage", "chris-jokes-session");
  const [uploadRecords, setUploadRecords, uploadSaveFailed] = useStoredRecords("localStorage", "chris-jokes-upload");
  const [uploadName, setUploadName] = useState("");
  const [sampleRecords, setSampleRecords] = useState([]);
  const chatContainerRef = useRef(null);
  const lastTopicRef = useRef(null);

  useEffect(() => {
    setSampleRecords(makeSampleRecords());
    try {
      setUploadName(window.localStorage.getItem("chris-jokes-upload-name") || "");
    } catch {}
  }, []);

  const replaceUpload = (records, name) => {
    setUploadRecords(records);
    setUploadName(name);
    try {
      window.localStorage.setItem("chris-jokes-upload-name", name);
    } catch {}
  };

  useEffect(() => {
    // Scroll to the bottom of the page whenever chatHistory changes
    if (tab === "chat") window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }, [chatHistory, tab]);

  const rateSessionJoke = updateRating(setSessionRecords);
  const ratingById = Object.fromEntries(sessionRecords.map((r) => [r.id, r.rating]));

  const clearSession = () => {
    if (window.confirm(`Delete all ${sessionRecords.length} jokes from this session?`)) setSessionRecords([]);
  };

  const showChatError = (text) =>
    setChatHistory((prev) => {
      const last = prev[prev.length - 1];
      if (last.content) return prev;
      return [...prev.slice(0, -1), { ...last, content: text }];
    });

  const sendMessage = async (text, knownTopic) => {
    const topic = knownTopic || topicFromMessage(text, lastTopicRef.current);
    lastTopicRef.current = topic;
    setLoading(true);
    // Append the user's message and an empty assistant bubble to fill in
    setChatHistory((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);

    // Send the user's message to the server
    let data;
    try {
      const response = await fetch("/api/generate?endpoint=chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      data = await response.json();
    } catch {
      data = { success: false };
    }
    if (!data.success) {
      setLoading(false);
      showChatError("Oops, my joke bombed. Please try again!");
      return;
    }

    // Open a connection to receive the streamed joke
    let fullJoke = "";
    const eventSource = new EventSource("/api/generate?endpoint=stream");
    eventSource.onmessage = (event) => {
      const chunk = JSON.parse(event.data);
      fullJoke += chunk;
      setChatHistory((prev) => {
        const last = prev[prev.length - 1];
        return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
      });
    };
    const finish = () => {
      eventSource.close();
      setLoading(false);
    };
    eventSource.addEventListener("done", () => {
      finish();
      if (!fullJoke.trim()) return;
      // Save the finished joke to the dataset and link the chat bubble to it for rating
      const record = makeRecord({ topic, joke: fullJoke, source: "chat" });
      setSessionRecords((prev) => [...prev, record]);
      setChatHistory((prev) => {
        const last = prev[prev.length - 1];
        return [...prev.slice(0, -1), { ...last, jokeId: record.id }];
      });
    });
    eventSource.onerror = () => {
      finish();
      showChatError("Oops, my joke bombed. Please try again!");
    };
  };

  const clearChat = async () => {
    setChatHistory([WELCOME]);
    await fetch("/api/generate?endpoint=reset", { method: "POST" });
  };

  const onSubmit = (event) => {
    event.preventDefault();
    if (!message.trim() || loading) return;
    sendMessage(message.trim());
    setMessage("");
  };

  const onKeyDown = (event) => {
    // Enter sends, Shift+Enter adds a new line
    if (event.key === "Enter" && !event.shiftKey) onSubmit(event);
  };

  return (
    <div className={styles.page}>
      <Head>
        <title>Chris's Joke Generator</title>
        <link rel="icon" href="/microphone.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bangers&family=Nunito:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <style jsx global>{`
        body {
          margin: 0;
          background: #12062b;
        }
      `}</style>

      <header className={styles.header}>
        <img src="/microphone.svg" alt="Comedy microphone" className={styles.icon} />
        <h1 className={styles.heading1}>Chris's Joke Generator</h1>
        <p className={styles.name}>Created by Christopher Bogash</p>
      </header>

      <nav className={styles.tabs} role="tablist" aria-label="Sections">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`${styles.tab} ${tab === id ? styles.activeTab : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
            {id === "session" && sessionRecords.length > 0 && (
              <span className={styles.badge}>{sessionRecords.length}</span>
            )}
            {id === "upload" && uploadRecords.length > 0 && (
              <span className={styles.badge}>{uploadRecords.length}</span>
            )}
          </button>
        ))}
      </nav>

      {(sessionSaveFailed || uploadSaveFailed) && (
        <p className={styles.warning}>
          Heads up: your browser wouldn't save the joke data, so it will be lost on refresh. Use "Download as CSV"
          to keep it.
        </p>
      )}

      {tab === "session" && (
        <JokeStats
          records={sessionRecords}
          title="Session Stats"
          description="Jokes you've asked for in the chat during this browser session."
          onRate={rateSessionJoke}
          onDelete={removeRecord(setSessionRecords)}
          actions={
            sessionRecords.length > 0 && (
              <>
                <button
                  className={dashStyles.secondaryButton}
                  onClick={() => downloadText("session-jokes.csv", recordsToCsv(sessionRecords))}
                >
                  Download as CSV
                </button>
                <button className={dashStyles.dangerButton} onClick={clearSession}>
                  Clear session
                </button>
              </>
            )
          }
          empty={
            <div className={dashStyles.emptyState}>
              <div className={dashStyles.emptyIcon}>🎤</div>
              <h3>The stage is empty!</h3>
              <p className={dashStyles.muted}>
                Ask for a few jokes in the chat and rate them with 👍 / 👎. Your charts will show up here.
              </p>
              <button className={dashStyles.primaryButton} onClick={() => setTab("chat")}>
                Tell me a joke
              </button>
            </div>
          }
        />
      )}

      {tab === "upload" && (
        <UploadPanel
          records={uploadRecords}
          fileName={uploadName}
          onReplace={replaceUpload}
          onAddRecords={(records) => setUploadRecords((prev) => [...prev, ...records])}
          onRate={updateRating(setUploadRecords)}
          onDelete={removeRecord(setUploadRecords)}
          onClear={() => replaceUpload([], "")}
        />
      )}

      {tab === "sample" && (
        <JokeStats
          records={sampleRecords}
          title="Sample Stats"
          description="A built-in sample of 30 jokes with made-up ratings, to show what the dashboard looks like."
          onRate={updateRating(setSampleRecords)}
        />
      )}

      {tab === "chat" && (
        <>
        <div className={styles.chatContainer} ref={chatContainerRef}>
          {chatHistory.map((msg, index) => (
            <div
              key={index}
              className={msg.role === "user" ? styles.userMessage : styles.assistantMessage}
            >
              {msg.content || <span className={styles.typing}>Thinking of a punchline…</span>}
              {msg.jokeId && msg.jokeId in ratingById && (
                <div className={styles.rating}>
                  <RatingButtons rating={ratingById[msg.jokeId]} onRate={(rating) => rateSessionJoke(msg.jokeId, rating)} />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className={styles.messageInputContainer}>
          <form className={styles.form} onSubmit={onSubmit}>
            <div className={styles.topics}>
              {TOPICS.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  className={styles.topicChip}
                  disabled={loading}
                  onClick={() => sendMessage(`Tell me a joke about ${topic.toLowerCase()}`, topic)}
                >
                  {topic}
                </button>
              ))}
            </div>
            <textarea
              className={styles.textarea}
              name="message"
              placeholder="Give me a topic for a joke…"
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={onKeyDown}
            ></textarea>
            <div className={styles.buttonGroup}>
              <input
                className={styles.inputSubmit}
                type="submit"
                value={loading ? "Writing…" : "Tell me a joke"}
                disabled={loading}
              />
              <button className={styles.inputButton} type="button" onClick={clearChat}>
                Clear
              </button>
            </div>
          </form>
        </div>
        </>
      )}
    </div>
  );
}
