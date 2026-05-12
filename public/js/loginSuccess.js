// public/js/loginSuccess.js
// Reads the login success flag from the body data attribute (set by EJS/server),
// shows a success banner for 1 second, then redirects to home.

document.addEventListener("DOMContentLoaded", () => {
  // The server sets data-login-success="true" on the body only after a
  // successful POST /login → redirect → GET /login cycle (flash flag pattern).
  const loginSuccessFlag = document.body.dataset.loginSuccess === "true";

  const statusDiv = document.getElementById("login-status");
  const form = document.getElementById("account-form");

  if (!loginSuccessFlag) return; // nothing to do on normal page loads

  // Show the success banner
  if (statusDiv) {
    statusDiv.className = "alert alert-success text-center mt-3";
    statusDiv.textContent = "Login Successful!";
  }

  // Hide the form so nothing is interactive during the 1-second delay
  if (form) form.style.display = "none";

  // Redirect after 1 second
  setTimeout(() => {
    window.location.href = "/";
  }, 1000);
});
