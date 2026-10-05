// Built-in demo dataset: real jokes with random ratings and timestamps, no API calls needed.
import { makeRecord } from "./jokeData";

// likeChance: how often a joke on this topic gets 👍 (so the per-topic chart has variety)
const SAMPLE_TOPICS = [
  {
    topic: "Cats",
    likeChance: 0.85,
    jokes: [
      "Why did the cat sit on the computer? To keep an eye on the mouse.",
      "What do you call a pile of cats? A meowtain.",
      "My cat knocked my coffee off the table, looked me right in the eye, and walked away. I've never respected anyone more or trusted anyone less.",
      "Why don't cats play poker in the jungle? Too many cheetahs.",
      "I asked my cat what two minus two was. She said nothing.",
    ],
  },
  {
    topic: "Programmers",
    likeChance: 0.75,
    jokes: [
      "Why do programmers prefer dark mode? Because light attracts bugs.",
      "A programmer's partner says, \"Go to the store and get a loaf of bread. If they have eggs, get a dozen.\" The programmer comes home with twelve loaves of bread.",
      "There are 10 kinds of people in the world: those who understand binary and those who don't.",
      "I would tell you a UDP joke, but you might not get it.",
      "Why did the developer go broke? Because he used up all his cache.",
    ],
  },
  {
    topic: "Pizza",
    likeChance: 0.5,
    jokes: [
      "I was going to tell you a pizza joke, but it's too cheesy.",
      "Why did the pizza maker go broke? He just couldn't make enough dough.",
      "What did the pizza say to the topping? I never sausage a beautiful face.",
      "I ordered a pizza with nothing on it. The delivery guy asked if I wanted it in a box, and I said no thanks, I'm trying to cut back on everything.",
    ],
  },
  {
    topic: "College finals",
    likeChance: 0.65,
    jokes: [
      "Finals week is the only time I'm genuinely excited about doing laundry.",
      "I studied so hard for my final that I forgot my own name. Luckily, it was on the top of the exam, which I left blank.",
      "My professor said the final would be open book. He didn't say which book, so I brought a cookbook and made the best of it.",
      "Why did the student bring a ladder to the final? Because they heard the grades were curved and wanted to reach the top.",
    ],
  },
  {
    topic: "Dinosaurs",
    likeChance: 0.7,
    jokes: [
      "What do you call a dinosaur that is sleeping? A dino-snore.",
      "Why can't you hear a pterodactyl going to the bathroom? Because the P is silent.",
      "What do you call a dinosaur with an extensive vocabulary? A thesaurus.",
      "Why did the T. rex never clap at concerts? Short arms, big feelings, and a deep personal respect for the band that he could only express by nodding.",
    ],
  },
  {
    topic: "Coffee",
    likeChance: 0.4,
    jokes: [
      "How does a coffee bean say goodbye? It doesn't, it just espresso-ly leaves.",
      "Coffee has a tough job. It gets mugged every morning.",
      "I asked the barista for a joke. She said it would take a latte effort.",
      "Decaf is like a hug from someone who doesn't really like you.",
    ],
  },
  {
    topic: "Space travel",
    likeChance: 0.6,
    jokes: [
      "Why did the astronaut break up with his girlfriend? He needed space.",
      "How do you organize a space party? You planet.",
      "I tried to read a book about anti-gravity, but I couldn't put it down.",
      "The restaurant on the moon has great food, but absolutely no atmosphere.",
    ],
  },
  {
    topic: "Homework",
    likeChance: 0.3,
    jokes: [
      "My dog ate my homework. It took him a few bytes.",
      "Why did the math book look sad? It had too many problems.",
      "I told my teacher I couldn't do my homework because the Wi-Fi was down. She said the assignment was on paper. I said yes, but my motivation was on the Wi-Fi.",
    ],
  },
];

const SAMPLE_SIZE = 30;

// Small seeded random generator (mulberry32) so the sample looks the same on every visit
function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// 30 jokes spread over the last few hours, about 1 in 5 left unrated
export function makeSampleRecords(seed = 5745) {
  const random = seededRandom(seed);
  const pool = SAMPLE_TOPICS.flatMap(({ topic, likeChance, jokes }) =>
    jokes.map((joke) => ({ topic, likeChance, joke }))
  );
  const now = Date.now();
  const spanMs = 3 * 60 * 60 * 1000;

  return shuffle(pool, random)
    .slice(0, SAMPLE_SIZE)
    .map(({ topic, likeChance, joke }, i) => {
      const rating = random() < 0.2 ? null : random() < likeChance ? "up" : "down";
      const timestamp = new Date(now - random() * spanMs).toISOString();
      return makeRecord({ id: `sample-${i}`, topic, joke, rating, timestamp, source: "sample" });
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
