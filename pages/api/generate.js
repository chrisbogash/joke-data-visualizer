import OpenAI from "openai";

const openai = new OpenAI();

const SYSTEM_PROMPT =
  "You are a funny, family-friendly comedian. Tell short, clever, appropriate jokes.";

// Plain-English prompt sent to ChatGPT. This replaces the original
// quickstart's generatePrompt(animal), which asked for superhero pet names.
function generatePrompt(topic) {
  return `Write one short, original, family-friendly joke about the topic below.
Keep it to a few sentences and end with a punchline.
If the topic is a follow-up request (like "another one" or "make it funnier"), use the conversation so far.

Topic: ${topic}`;
}

let chatHistory = [{ role: "system", content: SYSTEM_PROMPT }];

export default async function handler(req, res) {
  const { method } = req;

  switch (method) {
    case "POST":
      if (req.query.endpoint === "chat") {
        // Handle POST to /api/generate?endpoint=chat
        const topic = req.body.message;
        chatHistory.push({ role: "user", content: generatePrompt(topic) });
        res.status(200).json({ success: true });
      } else if (req.query.endpoint === "single") {
        // Handle POST to /api/generate?endpoint=single
        // One-off joke for CSV uploads; doesn't touch the chat's history
        const topic = String(req.body.topic || "").trim();
        if (!topic) {
          res.status(400).json({ error: "Missing topic" });
          break;
        }
        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-5.2",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: generatePrompt(topic) },
            ],
          });
          const joke = completion.choices[0]?.message?.content?.trim() || "";
          res.status(200).json({ joke });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Joke generation failed" });
        }
      } else if (req.query.endpoint === "reset") {
        // Handle POST to /api/generate?endpoint=reset
        chatHistory = [{ role: "system", content: SYSTEM_PROMPT }];
        res.status(200).json({ success: true });
      } else {
        res.status(404).json({ error: "Not Found" });
      }
      break;
    case "GET":
      if (req.query.endpoint === "history") {
        res.status(200).json(chatHistory);
      } else if (req.query.endpoint === "stream") {
        // Set headers for Server-Sent Events
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        try {
          const stream = openai.beta.chat.completions.stream({
            model: "gpt-5.2",
            messages: chatHistory,
            stream: true,
          });

          for await (const chunk of stream) {
            const message = chunk.choices[0]?.delta?.content || "";
            if (message) res.write(`data: ${JSON.stringify(message)}\n\n`);
          }

          // Save the full joke so follow-up requests have context
          const reply = await stream.finalContent();
          chatHistory.push({ role: "assistant", content: reply || "" });
          res.write("event: done\ndata: {}\n\n");
        } catch (error) {
          console.error(error);
          res.write(
            "event: error\ndata: " +
              JSON.stringify({ message: "Stream encountered an error" }) +
              "\n\n"
          );
        }
        res.end();
      } else {
        res.status(404).json({ error: "Not Found" });
      }
      break;
    default:
      res.setHeader("Allow", ["GET", "POST"]);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}
