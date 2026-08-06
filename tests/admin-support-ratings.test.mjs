import assert from "node:assert/strict";
import fs from "node:fs";

const support = fs.readFileSync("src/components/support-console.tsx", "utf8");
const api = fs.readFileSync("src/app/api/admin/action/route.ts", "utf8");
const css = fs.readFileSync("src/app/globals.css", "utf8");

assert.match(api, /support_conversation_ratings/);
assert.match(api, /\["bot", "transferred", "closed"\]/);
assert.match(api, /ratingsByConversation/);
assert.match(api, /\.in\("conversation_id", loadedConversationIds\)/);
assert.match(api, /rating:\s*ratingsByConversation/);
assert.match(support, /المحادثات المغلقة والتقييمات/);
assert.match(support, /تقييم هذه المحادثة/);
assert.match(support, /conversation\.rating/);
assert.match(support, /assignedLabel\(conversation, lang\)/);
assert.match(support, /selected\.status !== "closed"/);
assert.match(css, /\.queue-item-rating/);
assert.match(css, /\.conversation-rating-inline/);

console.log("admin inline support ratings checks passed");
