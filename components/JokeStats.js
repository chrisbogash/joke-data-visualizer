import { useMemo, useState } from "react";
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import styles from "./Dashboard.module.css";
import { topicKey } from "../lib/jokeData";

ChartJS.register(ArcElement, BarElement, CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip);

// Theme colors (validated for color-blind separation on the dark card surface)
const GOLD = "#ffd23f";
const CORAL = "#ff6b6b";
const VIOLET = "#8f6ae8";
const TEXT = "#f5f3ff";
const MUTED_TEXT = "#c4b5fd";
const GRID = "rgba(196, 181, 253, 0.12)";
const SURFACE = "#1e0b3d";

ChartJS.defaults.color = MUTED_TEXT;
ChartJS.defaults.font.family = '"Nunito", Helvetica, sans-serif';
ChartJS.defaults.borderColor = GRID;

const TOP_N = 10;
const WORD_BUCKETS = [
  { label: "1–10", max: 10 },
  { label: "11–20", max: 20 },
  { label: "21–30", max: 30 },
  { label: "31–40", max: 40 },
  { label: "41–50", max: 50 },
  { label: "51–60", max: 60 },
  { label: "61+", max: Infinity },
];
const MINUTE = 60 * 1000;
const TIME_STEPS = [MINUTE, 5 * MINUTE, 15 * MINUTE, 60 * MINUTE, 6 * 60 * MINUTE, 24 * 60 * MINUTE, 7 * 24 * 60 * MINUTE];
const STEP_NAMES = {
  [MINUTE]: "minute",
  [5 * MINUTE]: "5 minutes",
  [15 * MINUTE]: "15 minutes",
  [60 * MINUTE]: "hour",
  [6 * 60 * MINUTE]: "6 hours",
  [24 * 60 * MINUTE]: "day",
  [7 * 24 * 60 * MINUTE]: "week",
};

const tooltip = {
  backgroundColor: "#2b1055",
  borderColor: GOLD,
  borderWidth: 1,
  titleColor: TEXT,
  bodyColor: TEXT,
  padding: 10,
};

const axisOptions = (horizontal, extra = {}) => ({
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: horizontal ? "y" : "x",
  plugins: { legend: { display: false }, tooltip },
  scales: {
    x: { grid: { display: horizontal }, ticks: { precision: 0 }, beginAtZero: true },
    y: { grid: { display: !horizontal }, ticks: { precision: 0 }, beginAtZero: true },
  },
  ...extra,
});

const percent = (value) => `${Math.round(value * 100)}%`;

function computeStats(records) {
  const topics = new Map();
  let up = 0;
  let down = 0;
  let totalWords = 0;
  let totalChars = 0;

  for (const r of records) {
    const key = topicKey(r.topic);
    if (!topics.has(key)) topics.set(key, { name: r.topic, count: 0, up: 0, down: 0 });
    const t = topics.get(key);
    t.count++;
    if (r.rating === "up") {
      t.up++;
      up++;
    } else if (r.rating === "down") {
      t.down++;
      down++;
    }
    totalWords += r.wordCount;
    totalChars += r.charCount;
  }

  const topicList = [...topics.values()];
  const byCount = [...topicList].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const rated = topicList
    .filter((t) => t.up + t.down > 0)
    .map((t) => ({ ...t, rated: t.up + t.down, rate: t.up / (t.up + t.down) }))
    .sort((a, b) => b.rate - a.rate || b.rated - a.rated || a.name.localeCompare(b.name));

  // Word-count histogram
  const wordBuckets = WORD_BUCKETS.map(() => 0);
  for (const r of records) wordBuckets[WORD_BUCKETS.findIndex((b) => r.wordCount <= b.max)]++;

  // Jokes over time: pick a bucket size that gives at most ~40 points
  const times = records.map((r) => new Date(r.timestamp).getTime()).filter((t) => !isNaN(t));
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const step = TIME_STEPS.find((s) => (maxTime - minTime) / s <= 40) || TIME_STEPS[TIME_STEPS.length - 1];
  const start = Math.floor(minTime / step) * step;
  const bucketCount = Math.floor((maxTime - start) / step) + 1;
  const timeCounts = Array.from({ length: bucketCount }, () => 0);
  for (const t of times) timeCounts[Math.floor((t - start) / step)]++;
  const multiDay = new Date(minTime).toDateString() !== new Date(maxTime).toDateString();
  const timeLabels = timeCounts.map((_, i) => {
    const date = new Date(start + i * step);
    if (step >= 24 * 60 * MINUTE) return date.toLocaleDateString([], { month: "short", day: "numeric" });
    const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return multiDay ? `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}` : time;
  });

  return {
    total: records.length,
    up,
    down,
    unrated: records.length - up - down,
    avgWords: totalWords / records.length,
    avgChars: totalChars / records.length,
    topicCount: topicList.length,
    byCount,
    rated,
    wordBuckets,
    timeLabels,
    timeCounts,
    stepName: STEP_NAMES[step],
  };
}

function StatCard({ label, value, detail }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue} title={value}>
        {value}
      </div>
      <div className={styles.statDetail}>{detail}</div>
    </div>
  );
}

function ChartCard({ title, subtitle, children, wide, label }) {
  return (
    <div className={`${styles.card} ${wide ? styles.wide : ""}`}>
      <h3 className={styles.cardTitle}>{title}</h3>
      {subtitle && <p className={styles.chartSubtitle}>{subtitle}</p>}
      <div className={styles.chartBox} role="img" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

export function RatingButtons({ rating, onRate, compact }) {
  return (
    <span className={`${styles.ratingButtons} ${compact ? styles.compact : ""}`}>
      <button
        type="button"
        className={`${styles.rateButton} ${rating === "up" ? styles.ratedUp : ""}`}
        aria-pressed={rating === "up"}
        aria-label="Thumbs up"
        title="Thumbs up"
        onClick={() => onRate(rating === "up" ? null : "up")}
      >
        👍
      </button>
      <button
        type="button"
        className={`${styles.rateButton} ${rating === "down" ? styles.ratedDown : ""}`}
        aria-pressed={rating === "down"}
        aria-label="Thumbs down"
        title="Thumbs down"
        onClick={() => onRate(rating === "down" ? null : "down")}
      >
        👎
      </button>
    </span>
  );
}

// Dashboard for one dataset. `empty` is shown when there are no records; `actions` sit beside the title.
// `embedded` renders without the page-level panel wrapper (used inside the Upload tab).
export default function JokeStats({ records, title, description, actions, empty, onRate, onDelete, embedded }) {
  const [search, setSearch] = useState("");
  const stats = useMemo(() => (records.length ? computeStats(records) : null), [records]);
  const Wrapper = embedded ? "div" : "section";
  const header = (
    <div className={styles.dashHeader}>
      <div>
        <h2 className={embedded ? styles.subTitle : styles.sectionTitle}>{title}</h2>
        {description && <p className={styles.muted}>{description}</p>}
      </div>
      {actions && <div className={styles.headerActions}>{actions}</div>}
    </div>
  );

  if (!stats) {
    return (
      <Wrapper className={embedded ? undefined : styles.panel}>
        {header}
        {empty}
      </Wrapper>
    );
  }

  const topTopics = stats.byCount.slice(0, TOP_N);
  const topRated = stats.rated.slice(0, TOP_N);
  const best = stats.rated[0];
  const popular = stats.byCount[0];
  const query = search.trim().toLowerCase();
  const tableRows = [...records]
    .reverse()
    .filter((r) => !query || r.topic.toLowerCase().includes(query) || r.joke.toLowerCase().includes(query));

  const bar = (color) => ({ backgroundColor: color, borderRadius: 4, borderSkipped: "start", maxBarThickness: 28 });

  return (
    <Wrapper className={embedded ? undefined : styles.panel}>
      {header}

      <div className={styles.statGrid}>
        <StatCard
          label="Total jokes"
          value={stats.total}
          detail={`${stats.up + stats.down} rated · ${stats.topicCount} topic${stats.topicCount === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Most popular topic"
          value={popular.name}
          detail={`${popular.count} joke${popular.count === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Best-rated topic"
          value={best ? best.name : "—"}
          detail={best ? `${percent(best.rate)} 👍 of ${best.rated} rated` : "Rate some jokes to see this"}
        />
        <StatCard
          label="Average joke length"
          value={`${stats.avgWords.toFixed(1)} words`}
          detail={`${Math.round(stats.avgChars)} characters`}
        />
      </div>

      <div className={styles.chartGrid}>
        <ChartCard
          title="Jokes per topic"
          subtitle={stats.byCount.length > TOP_N ? `Top ${TOP_N} of ${stats.byCount.length} topics` : null}
          label="Bar chart of number of jokes per topic"
        >
          <Bar
            data={{
              labels: topTopics.map((t) => t.name),
              datasets: [{ label: "Jokes", data: topTopics.map((t) => t.count), ...bar(GOLD) }],
            }}
            options={axisOptions(true)}
          />
        </ChartCard>

        <ChartCard
          title="👍 rate per topic"
          subtitle={
            topRated.length
              ? "Share of rated jokes that got a thumbs up"
              : "No ratings yet — use 👍 / 👎 under a joke"
          }
          label="Bar chart of thumbs-up rate per topic"
        >
          <Bar
            data={{
              labels: topRated.map((t) => t.name),
              datasets: [{ label: "👍 rate", data: topRated.map((t) => t.rate * 100), ...bar(VIOLET) }],
            }}
            options={axisOptions(true, {
              plugins: {
                legend: { display: false },
                tooltip: {
                  ...tooltip,
                  callbacks: {
                    label: (ctx) => {
                      const t = topRated[ctx.dataIndex];
                      return ` ${percent(t.rate)} 👍 (${t.up} of ${t.rated} rated)`;
                    },
                  },
                },
              },
              scales: {
                x: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } },
                y: { grid: { display: false } },
              },
            })}
          />
        </ChartCard>

        <ChartCard title="Ratings" label="Doughnut chart of liked, disliked and unrated jokes">
          <Doughnut
            data={{
              labels: [`👍 Liked (${stats.up})`, `👎 Disliked (${stats.down})`, `Unrated (${stats.unrated})`],
              datasets: [
                {
                  data: [stats.up, stats.down, stats.unrated],
                  backgroundColor: [GOLD, CORAL, VIOLET],
                  borderColor: SURFACE,
                  borderWidth: 2,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              cutout: "60%",
              plugins: {
                legend: { position: "bottom", labels: { color: TEXT, usePointStyle: true, padding: 16 } },
                tooltip: {
                  ...tooltip,
                  callbacks: {
                    label: (ctx) => ` ${ctx.parsed} joke${ctx.parsed === 1 ? "" : "s"} (${percent(ctx.parsed / stats.total)})`,
                  },
                },
              },
            }}
          />
        </ChartCard>

        <ChartCard title="Joke length" subtitle="Number of jokes by word count" label="Histogram of joke word counts">
          <Bar
            data={{
              labels: WORD_BUCKETS.map((b) => b.label),
              datasets: [
                {
                  label: "Jokes",
                  data: stats.wordBuckets,
                  ...bar(CORAL),
                  maxBarThickness: undefined,
                  categoryPercentage: 1,
                  barPercentage: 0.94,
                },
              ],
            }}
            options={axisOptions(false, {
              plugins: {
                legend: { display: false },
                tooltip: { ...tooltip, callbacks: { title: (items) => `${items[0].label} words` } },
              },
            })}
          />
        </ChartCard>

        <ChartCard
          title="Jokes over time"
          subtitle={`Jokes added per ${stats.stepName}`}
          wide
          label="Line chart of jokes added over time"
        >
          {stats.timeCounts.length > 1 ? (
            <Line
              data={{
                labels: stats.timeLabels,
                datasets: [
                  {
                    label: "Jokes",
                    data: stats.timeCounts,
                    borderColor: GOLD,
                    backgroundColor: "rgba(255, 210, 63, 0.15)",
                    fill: true,
                    borderWidth: 2,
                    tension: 0,
                    pointRadius: stats.timeCounts.length > 20 ? 0 : 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: GOLD,
                  },
                ],
              }}
              options={axisOptions(false, {
                interaction: { mode: "index", intersect: false },
                scales: {
                  x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
                  y: { beginAtZero: true, ticks: { precision: 0 } },
                },
              })}
            />
          ) : (
            <div className={styles.chartNote}>
              All {stats.total} jokes were added within the same {stats.stepName}. This chart fills in as jokes are
              added over time (or upload a CSV with a <code>timestamp</code> column).
            </div>
          )}
        </ChartCard>
      </div>

      <div className={styles.card}>
        <div className={styles.tableHeader}>
          <h3 className={styles.cardTitle}>All jokes</h3>
          <input
            className={styles.search}
            type="search"
            placeholder="Search topic or joke…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Topic</th>
                <th>Joke</th>
                <th>Rating</th>
                {onDelete && (
                  <th>
                    <span className={styles.srOnly}>Delete</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => (
                <tr key={r.id}>
                  <td className={styles.topicCell}>{r.topic}</td>
                  <td className={styles.jokeCell}>
                    {r.joke}
                    <div className={styles.rowMeta}>
                      {r.wordCount} words · {new Date(r.timestamp).toLocaleString()} · {r.source}
                    </div>
                  </td>
                  <td>
                    <RatingButtons rating={r.rating} onRate={(rating) => onRate(r.id, rating)} compact />
                  </td>
                  {onDelete && (
                    <td>
                      <button
                        className={styles.deleteButton}
                        aria-label={`Delete joke about ${r.topic}`}
                        title="Delete"
                        onClick={() => onDelete(r.id)}
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!tableRows.length && (
                <tr>
                  <td colSpan={onDelete ? 4 : 3} className={styles.muted}>
                    No jokes match "{search}".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Wrapper>
  );
}
