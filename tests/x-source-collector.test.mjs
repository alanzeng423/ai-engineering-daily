import assert from "node:assert/strict";
import test from "node:test";

import {
  estimateXSignal,
  parseFxTwitterPayload,
  parseXgoFeed,
  parseXgoOpml,
} from "../scripts/collect-x-sources.mjs";

test("normalizes FxTwitter posts with time, links, metrics, and provenance", () => {
  const posts = parseFxTwitterPayload(
    {
      code: 200,
      results: [
        {
          type: "status",
          id: "2081760186235289764",
          url: "https://x.com/kimi_moonshot/status/2081760186235289764",
          text: "Kimi K3 technical report https://github.com/MoonshotAI/Kimi-K3",
          created_timestamp: 1785165280,
          author: { name: "Kimi", screen_name: "Kimi_Moonshot" },
          replies: 2,
          reposts: 3,
          likes: 4,
          quotes: 1,
          views: 100,
          card: { url: "https://github.com/MoonshotAI/Kimi-K3", title: "Kimi K3" },
          media: { all: [] },
        },
      ],
    },
    "Kimi_Moonshot",
  );
  assert.equal(posts.length, 1);
  assert.equal(posts[0].id, "2081760186235289764");
  assert.equal(posts[0].authorHandle, "Kimi_Moonshot");
  assert.ok(posts[0].linkedUrls.includes("https://github.com/MoonshotAI/Kimi-K3"));
  assert.equal(posts[0].metrics.likes, 4);
});

test("prioritizes substantive release posts over promotional announcements", () => {
  const release = estimateXSignal({
    text: "We released a technical report and benchmark with code https://example.com/report",
    linkedUrls: ["https://example.com/report"],
    authorHandle: "Lab",
    monitoredHandle: "Lab",
    isReply: false,
    isRepost: false,
    metrics: { likes: 100, reposts: 20, bookmarks: 30 },
  });
  const promotion = estimateXSignal({
    text: "Join us at our booth and register now",
    linkedUrls: [],
    authorHandle: "Lab",
    monitoredHandle: "Lab",
    isReply: false,
    isRepost: false,
    metrics: { likes: 2 },
  });
  assert.ok(release.signalScore > promotion.signalScore);
  assert.equal(release.reviewPriority, "high");
});

test("parses XGo OPML and feed items as a fallback source", () => {
  const opml = parseXgoOpml(
    '<outline text="OpenAI(@OpenAI)" type="rss" xmlUrl="https://api.xgo.ing/rss/user/example"/>',
  );
  assert.equal(opml.get("openai").url, "https://api.xgo.ing/rss/user/example");

  const feed = parseXgoFeed(
    `<rss><channel><item>
      <title>New coding agent report</title>
      <link>https://x.com/OpenAI/status/2082152074071228702</link>
      <description>&lt;div style='white-space: pre-wrap'&gt;New coding agent report&lt;br/&gt;with evidence.&lt;/div&gt;</description>
      <pubDate>Tue, 28 Jul 2026 17:11:53 GMT</pubDate>
      <guid>2082152074071228702</guid>
    </item></channel></rss>`,
    "OpenAI",
  );
  assert.equal(feed.length, 1);
  assert.equal(feed[0].provider, "xgo");
  assert.match(feed[0].text, /with evidence/);
});
