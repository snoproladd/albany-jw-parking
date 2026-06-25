/**
 * @file scripts/testNoteAnalyzer.js
 * @description One-shot smoke test for the Azure OpenAI note analysis pipeline.
 * Run with: node scripts/testNoteAnalyzer.js
 * Delete after confirming the integration works.
 */

import { analyzeNote, computeNoteHash } from "../lib/noteAnalyzer.js";

const TEST_VOLUNTEER = {
  id: 144,
  firstName: "Caleb",
  lastName: "Wells",
  note: "I have a baby so I can either stay late or come in early but won't be able to do both at the request of my wife.",
};

console.log("--- Note Analyzer Smoke Test ---");
console.log(
  `Volunteer : ${TEST_VOLUNTEER.firstName} ${TEST_VOLUNTEER.lastName}`,
);
console.log(`Note      : ${TEST_VOLUNTEER.note}`);
console.log(`Hash      : ${computeNoteHash(TEST_VOLUNTEER.note)}`);
console.log("\nCalling Azure OpenAI...\n");

try {
  const result = await analyzeNote(
    TEST_VOLUNTEER.id,
    TEST_VOLUNTEER.firstName,
    TEST_VOLUNTEER.lastName,
    TEST_VOLUNTEER.note,
  );

  if (result.error) {
    console.error("Analysis returned an error:", result.error);
    process.exit(1);
  }

  console.log("Summary            :", result.summary);
  console.log("Category           :", result.category);
  console.log("Flags              :", result.flags.join(", "));
  console.log(
    "Action items       :",
    JSON.stringify(result.actionItems, null, 2),
  );
  console.log(
    "Suggested blackouts:",
    JSON.stringify(result.suggestedBlackouts, null, 2),
  );
  console.log(
    `\nTokens — prompt: ${result.promptTokens}, completion: ${result.completionTokens}`,
  );
  console.log("\n✓ Integration test passed.");
} catch (err) {
  console.error("Unexpected error:", err);
  process.exit(1);
}
