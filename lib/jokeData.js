// Joke dataset helpers: record creation, topic/rating parsing, browser storage, CSV export.
import Papa from "papaparse";

export const MAX_TOPICS_PER_UPLOAD = 20;

export function countWords(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Tidy a topic for display: collapse spaces, drop trailing punctuation, capitalize.
export function cleanTopic(topic) {
  const cleaned = String(topic || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s"'“”]+|[\s"'“”.!?,;:]+$/g, "")
    .slice(0, 40)
    .trim();
  if (!cleaned) return "Random";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// Key used to group topics in the stats, so "cats" and "Cats" count together.
export function topicKey(topic) {
  return cleanTopic(topic).toLowerCase();
}

const FOLLOW_UP = /^(another( one)?|one more|more|again|make it .*|funnier|tell me another.*|that was .*)$/i;
const JOKE_PREFIX =
  /^(please\s+)?((can|could) you\s+)?(tell|give|write|make|say)\s+(me\s+)?(a\s+|another\s+|one more\s+|some\s+)?(funny\s+|good\s+|short\s+)?jokes?\s+(about|on|regarding|involving)\s+/i;

// Work out the topic from what the user typed. Follow-ups reuse the last topic.
export function topicFromMessage(message, lastTopic) {
  const text = message.trim().replace(/[.!?]+$/, "");
  if (lastTopic && FOLLOW_UP.test(text)) return lastTopic;
  const stripped = text.replace(JOKE_PREFIX, "").replace(/^(a\s+)?jokes?\s+about\s+/i, "");
  return cleanTopic(stripped);
}

// Ratings are stored as "up", "down", or null (unrated).
export function parseRating(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (["up", "👍", "1", "+1", "yes", "true", "like", "liked", "good", "positive"].includes(v)) return "up";
  if (["down", "👎", "-1", "0", "no", "false", "dislike", "disliked", "bad", "negative"].includes(v)) return "down";
  return null;
}

export function makeRecord({ topic, joke, rating = null, timestamp, source = "chat", id }) {
  const text = String(joke).trim();
  const parsedTime = timestamp ? new Date(timestamp) : null;
  return {
    id: id || makeId(),
    topic: cleanTopic(topic),
    joke: text,
    wordCount: countWords(text),
    charCount: text.length,
    timestamp: parsedTime && !isNaN(parsedTime) ? parsedTime.toISOString() : new Date().toISOString(),
    rating,
    source,
  };
}

// storage is window.localStorage or window.sessionStorage
export function loadRecords(storage, key) {
  try {
    const raw = storage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Returns false if the browser refused to save (e.g. storage full or blocked).
export function saveRecords(storage, key, records) {
  try {
    storage.setItem(key, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

export function recordsToCsv(records) {
  return Papa.unparse(
    records.map((r) => ({
      id: r.id,
      topic: r.topic,
      joke: r.joke,
      word_count: r.wordCount,
      char_count: r.charCount,
      timestamp: r.timestamp,
      rating: r.rating || "",
      source: r.source,
    })),
    { columns: ["id", "topic", "joke", "word_count", "char_count", "timestamp", "rating", "source"] }
  );
}

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
