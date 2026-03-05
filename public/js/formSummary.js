document.addEventListener("DOMContentLoaded", () => {
  const v = window.__VOLUNTEER__ || {};

  function display(value) {
    if (value === true) return "Yes";
    if (value === false) return "No";
    if (value === null || value === undefined || value === "") return "—";
    return value;
  }

  function setText(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.textContent = display(value);
  }

  // Basic fields
  setText('[data-field="firstName"]', v.firstName);
  setText('[data-field="lastName"]', v.lastName);
  setText('[data-field="suffix"]', v.suffix);
  setText('[data-field="email"]', v.email);
  setText('[data-field="phone"]', v.phone);

  setText('[data-field="gender"]', v.gender);
  setText(
    '[data-field="dobirth"]',
    v.dobirth ? new Date(v.dobirth).toLocaleDateString() : null
  );
  setText('[data-field="stamina"]', v.stamina);

  setText('[data-field="assignedToConv"]', v.assignedToConv);
  setText('[data-field="congregation"]', v.congregation);
  setText('[data-field="attendExtra"]', v.attendExtra);

  // Privileges
  const privilegeMap = {
    auxPioneer: "Auxiliary Pioneer",
    regPioneer: "Regular Pioneer",
    specPioneer: "Special Pioneer",
    minServ: "Ministerial Servant",
    elder: "Elder",
    sfs: "Special Full Time Service",
  };

  const list = document.getElementById("privilegeList");
  let hasPrivileges = false;

  Object.entries(privilegeMap).forEach(([key, label]) => {
    if (v[key]) {
      const li = document.createElement("li");
      li.className = "list-group-item";
      li.textContent = label;
      list.appendChild(li);
      hasPrivileges = true;
    }
  });

  if (!hasPrivileges) {
    const li = document.createElement("li");
    li.className = "list-group-item text-muted";
    li.textContent = "No privileges selected";
    list.appendChild(li);
  }

  // Print
  const printBtn = document.getElementById("printBtn");
  if (printBtn) {
    printBtn.addEventListener("click", () => {
      document.querySelectorAll(".collapse").forEach(c => c.classList.add("show"));
      window.print();
    });
  }
});