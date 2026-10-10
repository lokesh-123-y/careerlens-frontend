import { useState } from "react";
import "./App.css";

const API = "http://localhost:8080";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(
    Boolean(localStorage.getItem("token"))
  );
  const [page, setPage] = useState("dashboard");
  const [loginData, setLoginData] = useState({
    email: "",
    password: "",
  });
  const [message, setMessage] = useState("");
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedJob, setSelectedJob] = useState(null);
  const [applyingJobId, setApplyingJobId] = useState(null);

  const token = localStorage.getItem("token");
  const email = localStorage.getItem("email") || "";

  const authHeaders = () => ({
        Authorization: `Bearer ${localStorage.getItem("token")}`,
  });

  // LOGIN
  const handleLogin = async (e) => {
    e.preventDefault();
    setMessage("");

    try {
      const response = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginData),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Invalid email or password");
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("email", data.email);
      localStorage.setItem("role", data.role);

      setIsLoggedIn(true);
      setPage("dashboard");
      setLoginData({ email: "", password: "" });
    } catch (err) {
      console.error(err);
      setMessage("Backend connection failed");
    }
  };

  // LOGOUT
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("email");
    localStorage.removeItem("role");
    setIsLoggedIn(false);
    setPage("dashboard");
    setJobs([]);
    setApplications([]);
    setSelectedJob(null);
  };

  // RESUME UPLOAD
  const handleResumeUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      alert("Please select a PDF resume.");
      e.target.value = "";
      return;
    }

    if (!token) {
      alert("Please login again.");
      e.target.value = "";
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${API}/api/resume/upload`, {
        method: "POST",
        headers: authHeaders(),
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        alert("Resume uploaded and skills processed successfully!");
      } else {
        alert(data.message || data.error || "Resume upload failed.");
      }
    } catch (err) {
      console.error(err);
      alert("Backend connection failed.");
    } finally {
      e.target.value = "";
    }
  };

  // REMOVE DUPLICATE JOBS
  const removeDuplicateJobs = (items) => {
    const seen = new Set();

    return items.filter((job) => {
      const title = job.jobTitle || job.title || job.name || "";
      const company = job.company || job.companyName || "";
      const location = job.location || "";

      const key = `${title}|${company}|${location}`
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  // LOAD RECOMMENDED JOBS
  const handleViewJobs = async () => {
    setPage("jobs");
    setLoading(true);
    setError("");
    setSelectedJob(null);

    if (!token || !email) {
      setError("Please login again.");
      setLoading(false);
      return;
    }

    const params = new URLSearchParams({ email });

    try {
      let response = await fetch(
        `${API}/api/matching/recommended?${params.toString()}`,
        { headers: authHeaders() }
      );

      let matchingAvailable = response.ok;

      if (!response.ok) {
        // Fall back to the normal jobs list if matching is unavailable.
        response = await fetch(`${API}/api/jobs`, {
          headers: authHeaders(),
        });
      }

      if (!response.ok) {
        throw new Error(`Could not load jobs (HTTP ${response.status}).`);
      }

      const data = await response.json();

      const items = Array.isArray(data)
        ? data
        : Array.isArray(data.jobs)
        ? data.jobs
        : Array.isArray(data.content)
        ? data.content
        : [];

      const normalizedJobs = items.map((job) => ({
        ...job,
        id: job.jobId ?? job.id,
        title: job.jobTitle ?? job.title ?? job.name ?? "Untitled Job",
        company: job.company ?? job.companyName ?? "Not specified",
        requiredSkills:
          job.requiredSkills ?? job.skills ?? "Not specified",
        missingSkills: Array.isArray(job.missingSkills)
          ? job.missingSkills
          : [],
        matchingAvailable,
      }));

      const uniqueJobs = removeDuplicateJobs(normalizedJobs);
      setJobs(uniqueJobs);

      if (uniqueJobs.length === 0) {
        setError("No jobs are currently available.");
      }
    } catch (err) {
      console.error("Jobs error:", err);
      setError(err.message || "Could not load jobs.");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  // APPLY FOR JOB
  const handleApplyJob = async (job) => {
    const jobId = job.id;

    if (!jobId) {
      alert("Job ID is missing.");
      return;
    }

    if (!token || !email) {
      alert("Please login again.");
      return;
    }

    if (
      !window.confirm(
        `Apply for ${job.title || "this job"} at ${job.company || "this company"}?`
      )
    ) {
      return;
    }

    setApplyingJobId(jobId);

    try {
      const params = new URLSearchParams({
        email,
        jobId: String(jobId),
      });

      const response = await fetch(
        `${API}/api/applications/apply?${params.toString()}`,
        {
          method: "POST",
          headers: authHeaders(),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data === "string"
            ? data
            : data?.message || data?.error || "Application failed."
        );
      }

      alert("Application submitted successfully!");
    } catch (err) {
      console.error("Apply error:", err);
      alert(err.message || "Could not submit application.");
    } finally {
      setApplyingJobId(null);
    }
  };

  // LOAD USER APPLICATIONS
  const handleViewApplications = async () => {
    setPage("applications");
    setLoading(true);
    setError("");

    if (!token || !email) {
      setError("Please login again.");
      setLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams({ email });

      const response = await fetch(
        `${API}/api/applications/user?${params.toString()}`,
        { headers: authHeaders() }
      );

      if (!response.ok) {
        throw new Error(
          `Could not load applications (HTTP ${response.status}).`
        );
      }

      const data = await response.json();
      setApplications(Array.isArray(data) ? data : []);

      if (!Array.isArray(data) || data.length === 0) {
        setError("You have not applied for any jobs yet.");
      }
    } catch (err) {
      console.error("Applications error:", err);
      setError(err.message || "Could not load applications.");
      setApplications([]);
    } finally {
      setLoading(false);
    }
  };

  // LOGIN PAGE
  if (!isLoggedIn) {
    return (
      <div className="loginPage">
        <div className="loginCard">
          <h1 className="title">CareerLens</h1>
          <p className="subtitle">
            AI Career &amp; Job Management System
          </p>

          <form onSubmit={handleLogin}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={loginData.email}
              onChange={(e) =>
                setLoginData({ ...loginData, email: e.target.value })
              }
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={loginData.password}
              onChange={(e) =>
                setLoginData({ ...loginData, password: e.target.value })
              }
              required
            />

            <button type="submit" className="loginButton">
              Login
            </button>

            {message && <p className="errorMessage">{message}</p>}
          </form>
        </div>
      </div>
    );
  }

  // MAIN APP
  return (
    <div className="dashboard">
      <header className="navbar">
        <div>
          <h2 className="logo">CareerLens</h2>
          <span className="logoSubtitle">
            AI Career &amp; Job Management System
          </span>
        </div>

        <div className="navActions">
          {page !== "dashboard" && (
            <button
              className="cardButton"
              onClick={() => {
                setPage("dashboard");
                setError("");
                setSelectedJob(null);
              }}
            >
              Dashboard
            </button>
          )}

          <button className="logoutButton" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="dashboardMain">
        {page === "dashboard" && (
          <>
            <h1 className="welcome">Welcome back 👋</h1>
            <p className="userEmail">{email}</p>

            <div className="cards">
              <div className="card">
                <div className="cardIcon">📄</div>
                <h3>Resume</h3>
                <p>Upload your PDF resume and extract skills.</p>
                <label className="cardButton">
                  Upload Resume
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleResumeUpload}
                    hidden
                  />
                </label>
              </div>

              <div className="card">
                <div className="cardIcon">💼</div>
                <h3>Recommended Jobs</h3>
                <p>See matching percentage and missing skills.</p>
                <button className="cardButton" onClick={handleViewJobs}>
                  View Jobs
                </button>
              </div>

              <div className="card">
                <div className="cardIcon">📊</div>
                <h3>Applications</h3>
                <p>Track your application status.</p>
                <button
                  className="cardButton"
                  onClick={handleViewApplications}
                >
                  View Applications
                </button>
              </div>

              <div className="card">
                <div className="cardIcon">🎯</div>
                <h3>Profile</h3>
                <p>{email}</p>
                <p>Role: {localStorage.getItem("role") || "USER"}</p>
              </div>
            </div>
          </>
        )}

        {page === "jobs" && (
          <section className="overview">
            <h1 className="welcome">Recommended Jobs 💼</h1>
            <p>Jobs ranked by your resume skills.</p>

            <button
              className="cardButton"
              onClick={handleViewJobs}
              disabled={loading}
            >
              {loading ? "Loading..." : "Refresh Jobs"}
            </button>

            {loading && <p>Loading jobs...</p>}
            {error && <p className="errorMessage">{error}</p>}

            {!loading && jobs.length > 0 && (
              <div className="cards">
                {jobs.map((job, index) => (
                  <article
                    className="card"
                    key={job.id ?? `${job.title}-${job.company}-${index}`}
                  >
                    <div className="cardIcon">💼</div>
                    <h3>{job.title}</h3>
                    <p><strong>Company:</strong> {job.company}</p>
                    <p>
                      <strong>Location:</strong>{" "}
                      {job.location || "Not specified"}
                    </p>
                    <p>
                      <strong>Job type:</strong>{" "}
                      {job.jobType || "Not specified"}
                    </p>
                    <p>
                      <strong>Required skills:</strong>{" "}
                      {Array.isArray(job.requiredSkills)
                        ? job.requiredSkills.join(", ")
                        : job.requiredSkills}
                    </p>
                    {job.salary && (
                      <p><strong>Salary:</strong> {job.salary}</p>
                    )}

                    {job.matchingAvailable ? (
                      <>
                        <p>
                          <strong>Resume match:</strong>{" "}
                          {job.matchPercentage ?? 0}%
                        </p>
                        <p>
                          <strong>Missing skills:</strong>{" "}
                          {job.missingSkills.length
                            ? job.missingSkills.join(", ")
                            : "None identified"}
                        </p>
                      </>
                    ) : (
                      <p>
                        Upload a resume and ensure matching is available
                        to view your match percentage.
                      </p>
                    )}

                    {job.description && <p>{job.description}</p>}

                    <button
                      className="cardButton"
                      onClick={() => setSelectedJob(job)}
                    >
                      View Details
                    </button>
                    <button
                      className="cardButton"
                      onClick={() => handleApplyJob(job)}
                      disabled={!job.id || applyingJobId === job.id}
                    >
                      {applyingJobId === job.id
                        ? "Applying..."
                        : "Apply Now"}
                    </button>

                    {selectedJob?.id === job.id && (
                      <div className="jobDetails">
                        <h4>Job Details</h4>
                        <p>{job.description || "No description available."}</p>
                        <button
                          className="cardButton"
                          onClick={() => setSelectedJob(null)}
                        >
                          Close Details
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {page === "applications" && (
          <section className="overview">
            <h1 className="welcome">My Applications 📊</h1>
            <p>Track the progress of your applications.</p>

            <button
              className="cardButton"
              onClick={handleViewApplications}
              disabled={loading}
            >
              {loading ? "Loading..." : "Refresh Applications"}
            </button>

            {loading && <p>Loading applications...</p>}
            {error && <p className="errorMessage">{error}</p>}

            {!loading && applications.length > 0 && (
              <div className="cards">
                {applications.map((application, index) => {
                  const job = application.job || {};
                  return (
                    <article
                      className="card"
                      key={application.id ?? application.applicationId ?? index}
                    >
                      <h3>
                        {job.title ||
                          job.jobTitle ||
                          application.jobTitle ||
                          `Application ${index + 1}`}
                      </h3>
                      <p>
                        <strong>Company:</strong>{" "}
                        {job.company || job.companyName ||
                          application.companyName || "Not specified"}
                      </p>
                      <p>
                        <strong>Status:</strong>{" "}
                        {application.status || "Pending"}
                      </p>
                      <p>
                        <strong>Applied:</strong>{" "}
                        {application.appliedAt ||
                          application.applicationDate ||
                          "Date not available"}
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;