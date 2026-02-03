// Uses rules injected by EJS template:
const INCOMPATIBILITIES = window.PRIVILEGE_RULES || {};
const GENDER = window.USER_GENDER || null;

document.addEventListener("DOMContentLoaded", () => {
  const inputs = document.querySelectorAll("input[data-privilege]");
  if (!inputs.length) return;

  function recomputeDisabled() {
    // Enable everything first
    inputs.forEach((input) => {
      input.disabled = false;
    });

    // Figure out which privileges are currently selected
    const selected = Array.from(inputs)
      .filter((i) => i.checked)
      .map((i) => i.dataset.privilege);

    // 1) Apply incompatibilities for selected privileges
    selected.forEach((sel) => {
      const bad = INCOMPATIBILITIES[sel] || [];
      bad.forEach((opt) => {
        const target = document.querySelector(`input[data-privilege="${opt}"]`);
        if (target && !target.checked) {
          target.disabled = true;
        }
      });
    });

    // 2) Apply incompatibilities based on gender (if we know it)
    //    Example from your rules:
    //    female: ["male", "minServ", "elder"]
    if (GENDER && INCOMPATIBILITIES[GENDER]) {
      const genderBad = INCOMPATIBILITIES[GENDER];
      genderBad.forEach((opt) => {
        const target = document.querySelector(`input[data-privilege="${opt}"]`);
        if (target && !target.checked) {
          target.disabled = true;
        }
      });
    }
  }

  // Recompute whenever any privilege checkbox changes
  inputs.forEach((i) => i.addEventListener("change", recomputeDisabled));

  // Initial state on page load
  recomputeDisabled();
});
