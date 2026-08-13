import assert from "node:assert/strict";
import test from "node:test";
import { applyCommand, authenticateUser, createInitialState, voteCounts } from "../src/game-state.js";

function register(state, username, hash = `${username}-hash`) {
  return authenticateUser(state, username, hash).state;
}

test("a room supports one poll, one vote, and immediate scoring", () => {
  let state = createInitialState("friends");
  state = register(state, "Host");
  state = register(state, "Alice");
  state = register(state, "Bob");

  state = applyCommand(state, { type: "claim-host" }, { username: "Host" }).state;
  state = applyCommand(state, {
    type: "add-question",
    text: "Tea or coffee?",
    options: ["Tea", "Coffee"],
  }, { username: "Host" }).state;

  state = applyCommand(state, { type: "vote", voteIndex: 0, guessIndex: 0 }, { username: "Alice" }).state;
  state = applyCommand(state, { type: "vote", voteIndex: 1, guessIndex: 0 }, { username: "Bob" }).state;
  const duplicate = applyCommand(state, { type: "vote", voteIndex: 1, guessIndex: 1 }, { username: "Alice" });
  assert.equal(duplicate.changed, false);

  state = applyCommand(state, { type: "close-question" }, { username: "Host" }).state;
  assert.deepEqual(voteCounts(state.questions[0]), [1, 1]);
  assert.equal(state.questions[0].closed, true);
  assert.equal(state.users.Alice.pollsVoted, 1);
  assert.equal(state.users.Alice.guessesCorrect, 0, "a tied poll has no winning prediction");
});

test("new poll closes an existing poll and host authority is enforced", () => {
  let state = createInitialState("friends");
  state = register(register(state, "Host"), "Alice");
  state = applyCommand(state, { type: "claim-host" }, { username: "Host" }).state;
  const denied = applyCommand(state, { type: "add-question", text: "No", options: ["A", "B"] }, { username: "Alice" });
  assert.equal(denied.changed, false);
  assert.match(denied.error, /host/i);

  state = applyCommand(state, { type: "add-question", text: "First", options: ["A", "B"] }, { username: "Host" }).state;
  state = applyCommand(state, { type: "add-question", text: "Second", options: ["C", "D"] }, { username: "Host" }).state;
  assert.equal(state.questions[0].closed, true);
  assert.equal(state.questions[1].closed, false);
});

test("room-scoped username passwords are checked", () => {
  const initial = createInitialState("friends");
  const registered = authenticateUser(initial, "Alice", "correct");
  assert.equal(registered.result, "new_user");
  assert.equal(authenticateUser(registered.state, "Alice", "correct").result, "ok");
  assert.equal(authenticateUser(registered.state, "Alice", "wrong").result, "bad_password");
});

test("a unique majority awards prediction accuracy exactly once", () => {
  let state = createInitialState("majority");
  state = register(register(register(state, "Host"), "Alice"), "Bob");
  state = applyCommand(state, { type: "claim-host" }, { username: "Host" }).state;
  state = applyCommand(state, { type: "add-question", text: "Pick one", options: ["A", "B"] }, { username: "Host" }).state;
  state = applyCommand(state, { type: "vote", voteIndex: 0, guessIndex: 0 }, { username: "Alice" }).state;
  state = applyCommand(state, { type: "vote", voteIndex: 0, guessIndex: 0 }, { username: "Bob" }).state;
  state = applyCommand(state, { type: "close-question" }, { username: "Host" }).state;
  assert.equal(state.users.Alice.guessesCorrect, 1);
  assert.equal(state.users.Bob.guessesCorrect, 1);

  const closedAgain = applyCommand(state, { type: "close-question" }, { username: "Host" });
  assert.equal(closedAgain.changed, false);
  assert.equal(closedAgain.state.users.Alice.guessesCorrect, 1);
});
