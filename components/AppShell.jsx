"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { getRubric } from "@/lib/rubric";
import { calculateAggregate, passesRound1, isFinalSelected } from "@/lib/calculations";

const COLORS = ["#1C3E3B", "#B2C7C0", "#6C8C80", "#C6D6D0", "#8DA6A0", "#E6DED4", "#57786e"];

const emptyFilterState = {
  pathway: "all",
  schoolName: "all",
  schoolType: "all",
  region: "all",
  coordinator: "all",
  status: "all",
  seen_reviewed: "any",
  need_fixing_school: "any",
  need_fixing_internal: "any",
  search: ""
};

function templateColumns() {
  return [
    "No",
    "Pathway",
    "Art Sub Pathway",
    "Art Work Title",
    "School Name Eng",
    "School eSIS",
    "School Type",
    "Region",
    "Coordinator Username",
    "Registration Type",
    "Number of students",
    "Names Eng-corrected",
    "Participating Students Grades",
    "Participating Students Gender",
    "Participating Students Nationalities",
    "Student eSIS",
    "Preview Image",
    "File link",
    "Note",
    "Art Work Medium",
    "Art Work Dimension",
    "Description"
  ];
}

function boolFilter(value, mode) {
  if (mode === "any") return true;
  if (mode === "yes") return !!value;
  if (mode === "no") return !value;
  return true;
}

function statusMatch(item, status) {
  if (status === "all") return true;
  if (status === "round1_not_complete") return !item.round1.completed;
  if (status === "round1_selected") return item.round1.autoAdvanced;
  if (status === "round1_not_selected") return item.round1.completed && !item.round1.autoAdvanced;
  if (status === "round2_not_completed") return item.round1.autoAdvanced && !item.round2.completed;
  if (status === "round2_not_selected") return item.round2.completed && !item.round2.finalSelected;
  if (status === "final_selected") return item.round2.finalSelected;
  return true;
}

function kpiClass(value, type) {
  if (type === "shortlist" && value > 2000) return "kpi-danger";
  if (type === "final" && value > 1700) return "kpi-danger";
  if (type === "final" && value === 1700) return "kpi-good";
  return "";
}

function downloadJson(rows, fileName, format) {
  const ws = XLSX.utils.json_to_sheet(rows);
  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}

function PreviewModal({ open, imageUrl, onClose }) {
  const [zoom, setZoom] = useState(1);
  useEffect(() => { if (open) setZoom(1); }, [open, imageUrl]);
  if (!open || !imageUrl) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: "min(1400px, 100%)", maxHeight: "94vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 24, fontWeight: 800 }}>Artwork Preview</div>
          <div className="filters-row">
            <button className="btn outline" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>-</button>
            <div className="small-card" style={{ padding: "10px 14px" }}>{Math.round(zoom * 100)}%</div>
            <button className="btn outline" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>+</button>
            <button className="btn outline" onClick={onClose}>Close</button>
          </div>
        </div>
        <div style={{ overflow: "auto", maxHeight: "calc(94vh - 96px)", border: "1px solid var(--border)", borderRadius: 16, background: "#fafafa", padding: 18 }}>
          <img src={imageUrl} alt="Preview" style={{ width: `${zoom * 100}%`, maxWidth: "none", display: "block", margin: "0 auto" }} />
        </div>
      </div>
    </div>
  );
}

function DetailModal({ open, submission, currentUser, coordinators, onClose, onSave, onOpenPreview }) {
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    if (!submission) return;
    setDraft({
      seen_reviewed: !!submission.seen_reviewed,
      need_fixing_school: !!submission.need_fixing_school,
      need_fixing_internal: !!submission.need_fixing_internal,
      artwork_collected: !!submission.artwork_collected,
      management_comments: submission.management_comments || "",
      management_round1_total_score: submission.management_round1_total_score ?? "",
      management_round1_grade: submission.management_round1_grade || "",
      management_round1_comments: submission.management_round1_comments || "",
      management_round2_total_score: submission.management_round2_total_score ?? "",
      management_round2_grade: submission.management_round2_grade || "",
      management_round2_national_identity: submission.management_round2_national_identity === null || submission.management_round2_national_identity === undefined ? "" : submission.management_round2_national_identity ? "yes" : "no",
      management_round2_comments: submission.management_round2_comments || "",
      assigned_coordinator_id: submission.assigned_coordinator_id || ""
    });
  }, [submission]);

  if (!open || !submission || !draft) return null;
  const canEdit = currentUser.role === "admin";

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{submission.artwork_name}</div>
            <div style={{ opacity: 0.75 }}>{submission.pathway} · {submission.sub_pathway || "No sub pathway"}</div>
          </div>
          <button className="btn outline" onClick={onClose}>Close</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 16 }}>
          <div>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {submission.preview_url ? <img src={submission.preview_url} alt={submission.artwork_name} style={{ width: "100%", display: "block" }} /> : <div style={{ padding: 40, textAlign: "center" }}>No preview</div>}
            </div>
            <div className="filters-row" style={{ marginTop: 12 }}>
              {submission.preview_url ? <button className="btn soft" onClick={() => onOpenPreview(submission.preview_url)}>Open Preview</button> : null}
              {submission.source_file_url ? <a className="btn" href={submission.source_file_url} target="_blank" rel="noreferrer">Open Source File</a> : null}
            </div>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            <div className="card">
              <strong>Submission Details</strong>
              <div style={{ marginTop: 8, lineHeight: 1.85 }}>
                <div>Submission Code: {submission.submission_code}</div>
                <div>School: {submission.school_name}</div>
                <div>School eSIS: {submission.school_esis || "-"}</div>
                <div>School Type: {submission.school_type || "Unspecified"}</div>
                <div>Region: {submission.region || "-"}</div>
                <div>Coordinator: {submission.assigned_coordinator_name || "-"}</div>
                <div>Students: {submission.students.map((s) => s.student_name).join(", ") || "-"}</div>
                <div>Student eSIS: {submission.students.map((s) => s.student_esis).join(", ") || "-"}</div>
                <div>Medium: {submission.medium || "-"}</div>
                <div>Dimensions: {submission.dimensions || "-"}</div>
              </div>
            </div>

            <div className="card">
              <strong>Review Flags</strong>
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                <label><input type="checkbox" checked={draft.seen_reviewed} onChange={(e) => setDraft((prev) => ({ ...prev, seen_reviewed: e.target.checked }))} /> Seen / Reviewed</label>
                <label><input type="checkbox" checked={draft.need_fixing_school} onChange={(e) => setDraft((prev) => ({ ...prev, need_fixing_school: e.target.checked }))} /> Need Fixing - By School</label>
                <label><input type="checkbox" checked={draft.need_fixing_internal} onChange={(e) => setDraft((prev) => ({ ...prev, need_fixing_internal: e.target.checked }))} /> Need Fixing - Internal</label>
                <label><input type="checkbox" checked={draft.artwork_collected} onChange={(e) => setDraft((prev) => ({ ...prev, artwork_collected: e.target.checked }))} /> Artwork collected</label>
              </div>
            </div>

            <div className="card">
              <strong>Management Controls</strong>
              <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                <div>
                  <div style={{ fontSize: 13, marginBottom: 6 }}>Assigned Coordinator</div>
                  <select className="field" disabled={!canEdit} value={draft.assigned_coordinator_id} onChange={(e) => setDraft((prev) => ({ ...prev, assigned_coordinator_id: e.target.value }))}>
                    <option value="">Unassigned</option>
                    {coordinators.map((c) => <option key={c.id} value={c.id}>{c.username}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 13, marginBottom: 6 }}>Management Comments</div>
                  <textarea className="textarea" disabled={!canEdit} value={draft.management_comments} onChange={(e) => setDraft((prev) => ({ ...prev, management_comments: e.target.value }))} />
                </div>
                <div className="small-card">
                  <strong>Management 1st Round Revaluation</strong>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                    <input className="field" disabled={!canEdit} placeholder="Score" value={draft.management_round1_total_score} onChange={(e) => setDraft((prev) => ({ ...prev, management_round1_total_score: e.target.value }))} />
                    <select className="field" disabled={!canEdit} value={draft.management_round1_grade} onChange={(e) => setDraft((prev) => ({ ...prev, management_round1_grade: e.target.value }))}>
                      <option value="">No override grade</option><option value="A">A</option><option value="B">B</option><option value="C">C</option>
                    </select>
                  </div>
                  <textarea className="textarea" disabled={!canEdit} style={{ marginTop: 10 }} value={draft.management_round1_comments} onChange={(e) => setDraft((prev) => ({ ...prev, management_round1_comments: e.target.value }))} />
                </div>
                <div className="small-card">
                  <strong>Management 2nd Round Revaluation</strong>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
                    <input className="field" disabled={!canEdit} placeholder="Score" value={draft.management_round2_total_score} onChange={(e) => setDraft((prev) => ({ ...prev, management_round2_total_score: e.target.value }))} />
                    <select className="field" disabled={!canEdit} value={draft.management_round2_grade} onChange={(e) => setDraft((prev) => ({ ...prev, management_round2_grade: e.target.value }))}>
                      <option value="">No override grade</option><option value="A">A</option><option value="B">B</option><option value="C">C</option>
                    </select>
                    <select className="field" disabled={!canEdit} value={draft.management_round2_national_identity} onChange={(e) => setDraft((prev) => ({ ...prev, management_round2_national_identity: e.target.value }))}>
                      <option value="">No override</option><option value="yes">Yes</option><option value="no">No</option>
                    </select>
                  </div>
                  <textarea className="textarea" disabled={!canEdit} style={{ marginTop: 10 }} value={draft.management_round2_comments} onChange={(e) => setDraft((prev) => ({ ...prev, management_round2_comments: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="filters-row"><button className="btn" onClick={() => onSave(submission.id, draft)}>Save Details</button></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserModal({ open, user, onClose, onSave }) {
  const [draft, setDraft] = useState({ username: "", display_name: "", role: "coordinator", active: true, password: "", pathways: [] });
  useEffect(() => {
    setDraft(user ? { username: user.username || "", display_name: user.display_name || "", role: user.role || "coordinator", active: user.active !== false, password: "", pathways: user.pathways || [] } : { username: "", display_name: "", role: "coordinator", active: true, password: "", pathways: [] });
  }, [user]);
  if (!open) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: "min(640px, 100%)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{user ? "Edit User" : "Add User"}</div>
          <button className="btn outline" onClick={onClose}>Close</button>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <input className="field" placeholder="Username" value={draft.username} onChange={(e) => setDraft((prev) => ({ ...prev, username: e.target.value }))} />
          <input className="field" placeholder="Display Name" value={draft.display_name} onChange={(e) => setDraft((prev) => ({ ...prev, display_name: e.target.value }))} />
          <select className="field" value={draft.role} onChange={(e) => setDraft((prev) => ({ ...prev, role: e.target.value }))}><option value="coordinator">Coordinator</option><option value="admin">Admin</option></select>
          <input className="field" type="password" placeholder={user ? "New password (optional)" : "Password"} value={draft.password} onChange={(e) => setDraft((prev) => ({ ...prev, password: e.target.value }))} />
          <label><input type="checkbox" checked={draft.active} onChange={(e) => setDraft((prev) => ({ ...prev, active: e.target.checked }))} /> Active</label>
          <div className="filters-row"><button className="btn" onClick={() => onSave(draft)}>{user ? "Save User" : "Create User"}</button></div>
        </div>
      </div>
    </div>
  );
}

function EvaluatorModal({ open, evaluator, onClose, onSave }) {
  const [draft, setDraft] = useState({ name: "", active: true });
  useEffect(() => {
    setDraft(evaluator ? { name: evaluator.name || "", active: evaluator.active !== false } : { name: "", active: true });
  }, [evaluator]);
  if (!open) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: "min(520px, 100%)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{evaluator ? "Edit Evaluator" : "Add Evaluator"}</div>
          <button className="btn outline" onClick={onClose}>Close</button>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <input className="field" placeholder="Evaluator Name" value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} />
          <label><input type="checkbox" checked={draft.active} onChange={(e) => setDraft((prev) => ({ ...prev, active: e.target.checked }))} /> Active</label>
          <div className="filters-row"><button className="btn" onClick={() => onSave(draft)}>{evaluator ? "Save Evaluator" : "Create Evaluator"}</button></div>
        </div>
      </div>
    </div>
  );
}

function FiltersModal({ open, onClose, tempFilters, setTempFilters, pathwayOptions, schoolNames, schoolTypes, regions, coordinators, onApply, onClear }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: "min(820px, 100%)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 800 }}>All Submissions Filters</div>
          <button className="btn outline" onClick={onClose}>Close</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <select className="field" value={tempFilters.pathway} onChange={(e) => setTempFilters((prev) => ({ ...prev, pathway: e.target.value }))}><option value="all">All pathways</option>{pathwayOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select className="field" value={tempFilters.schoolName} onChange={(e) => setTempFilters((prev) => ({ ...prev, schoolName: e.target.value }))}><option value="all">All schools</option>{schoolNames.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select className="field" value={tempFilters.schoolType} onChange={(e) => setTempFilters((prev) => ({ ...prev, schoolType: e.target.value }))}><option value="all">All school types</option>{schoolTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select className="field" value={tempFilters.region} onChange={(e) => setTempFilters((prev) => ({ ...prev, region: e.target.value }))}><option value="all">All regions</option>{regions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select className="field" value={tempFilters.coordinator} onChange={(e) => setTempFilters((prev) => ({ ...prev, coordinator: e.target.value }))}><option value="all">All coordinators</option>{coordinators.map((item) => <option key={item.id} value={item.id}>{item.username}</option>)}</select>
          <select className="field" value={tempFilters.status} onChange={(e) => setTempFilters((prev) => ({ ...prev, status: e.target.value }))}>
            <option value="all">All statuses</option>
            <option value="round1_not_complete">Round 1 Not Complete</option>
            <option value="round1_selected">Round 1 Selected</option>
            <option value="round1_not_selected">Round 1 Not Selected</option>
            <option value="round2_not_completed">Round 2 Not Completed</option>
            <option value="round2_not_selected">Round 2 Not Selected</option>
            <option value="final_selected">Final Selected</option>
          </select>
          <select className="field" value={tempFilters.seen_reviewed} onChange={(e) => setTempFilters((prev) => ({ ...prev, seen_reviewed: e.target.value }))}><option value="any">Seen / Reviewed - Any</option><option value="yes">Seen / Reviewed - Yes</option><option value="no">Seen / Reviewed - No</option></select>
          <select className="field" value={tempFilters.need_fixing_school} onChange={(e) => setTempFilters((prev) => ({ ...prev, need_fixing_school: e.target.value }))}><option value="any">Need Fixing - By School - Any</option><option value="yes">Need Fixing - By School - Yes</option><option value="no">Need Fixing - By School - No</option></select>
          <select className="field" value={tempFilters.need_fixing_internal} onChange={(e) => setTempFilters((prev) => ({ ...prev, need_fixing_internal: e.target.value }))}><option value="any">Need Fixing - Internal - Any</option><option value="yes">Need Fixing - Internal - Yes</option><option value="no">Need Fixing - Internal - No</option></select>
          <input className="field" placeholder="Search" value={tempFilters.search} onChange={(e) => setTempFilters((prev) => ({ ...prev, search: e.target.value }))} />
        </div>
        <div className="filters-row" style={{ marginTop: 16 }}>
          <button className="btn" onClick={onApply}>Save Filters</button>
          <button className="btn outline" onClick={onClear}>Clear All Filters</button>
        </div>
      </div>
    </div>
  );
}

function SubmissionCard({ submission, onOpenDetails, onOpenPreview }) {
  return (
    <div className="small-card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ height: 180, background: "var(--sand)", overflow: "hidden" }}>
        {submission.preview_url ? <img src={submission.preview_url} alt={submission.artwork_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>No preview</div>}
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ fontWeight: 800 }}>{submission.artwork_name}</div>
        <div style={{ fontSize: 13, opacity: 0.75, marginTop: 6 }}>{submission.school_name}</div>
        <div style={{ fontSize: 13, opacity: 0.75 }}>{submission.students.map((s) => s.student_name).join(", ")}</div>
        <div style={{ marginTop: 8 }}>
          <span className="badge">{submission.pathway}</span>
          {submission.sub_pathway ? <span className="badge-outline">{submission.sub_pathway}</span> : null}
          {submission.round1.autoAdvanced ? <span className="badge-soft">Round 1 Selected</span> : null}
          {submission.round2.finalSelected ? <span className="badge">Final Selected</span> : null}
        </div>
        <div className="filters-row" style={{ marginTop: 12 }}>
          {submission.preview_url ? <button className="btn soft" onClick={() => onOpenPreview(submission.preview_url)}>Preview</button> : null}
          <button className="btn outline" onClick={() => onOpenDetails(submission)}>View Full Details</button>
        </div>
      </div>
    </div>
  );
}

export default function AppShell({ session }) {
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(session);
  const [users, setUsers] = useState([]);
  const [evaluators, setEvaluators] = useState([]);
  const [rawSubmissions, setRawSubmissions] = useState([]);
  const [evaluationRecords, setEvaluationRecords] = useState([]);
  const [schools, setSchools] = useState([]);
  const [students, setStudents] = useState([]);
  const [submissionStudents, setSubmissionStudents] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [activeTab, setActiveTab] = useState("workspace");
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [finalFilter, setFinalFilter] = useState("all");
  const [selectedSubmissionId, setSelectedSubmissionId] = useState("");
  const [detailSubmission, setDetailSubmission] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [allFilters, setAllFilters] = useState(emptyFilterState);
  const [tempFilters, setTempFilters] = useState(emptyFilterState);
  const [exportFormat, setExportFormat] = useState("xlsx");
  const [dashboardStage, setDashboardStage] = useState("all_submissions");
  const [dashboardFilterPathway, setDashboardFilterPathway] = useState("all");
  const [dashboardFilterSchoolType, setDashboardFilterSchoolType] = useState("all");
  const [dashboardFilterRegion, setDashboardFilterRegion] = useState("all");
  const [dashboardFilterCoordinator, setDashboardFilterCoordinator] = useState("all");
  const [sessionDraft, setSessionDraft] = useState({ pathway: "", evaluatorIds: [], round: "round1", evaluationDate: new Date().toISOString().slice(0, 10), loaded: false });
  const [sessionState, setSessionState] = useState({ pathway: "", evaluatorIds: [], round: "round1", evaluationDate: new Date().toISOString().slice(0, 10), loaded: false });
  const [draftEvaluations, setDraftEvaluations] = useState({});
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [evaluatorModalOpen, setEvaluatorModalOpen] = useState(false);
  const [editingEvaluator, setEditingEvaluator] = useState(null);
  const [studentFilters, setStudentFilters] = useState({ grade: "all", school: "all", nationality: "all", search: "" });
  const [schoolFilters, setSchoolFilters] = useState({ schoolType: "all", region: "all", search: "" });
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedSchoolId, setSelectedSchoolId] = useState("");

  async function bootstrap() {
    setLoading(true);
    const response = await fetch("/api/bootstrap", { cache: "no-store" });
    if (response.status === 401) { window.location.href = "/login"; return; }
    const data = await response.json();
    setCurrentUser(data.currentUser);
    setUsers(data.users || []);
    setEvaluators(data.evaluators || []);
    setRawSubmissions(data.rawSubmissions || []);
    setEvaluationRecords(data.evaluationRecords || []);
    setSchools(data.schools || []);
    setStudents(data.students || []);
    setSubmissionStudents(data.submissionStudents || []);
    setLoading(false);
  }

  useEffect(() => { bootstrap(); }, []);

  useEffect(() => {
    if (loading) return;
    const schoolsById = Object.fromEntries(schools.map((school) => [school.id, school]));
    const studentsById = Object.fromEntries(students.map((student) => [student.id, student]));
    const usersById = Object.fromEntries(users.map((user) => [user.id, user]));
    const evaluatorNames = Object.fromEntries(evaluators.map((item) => [item.id, item.name]));
    const linksBySubmission = {};
    submissionStudents.forEach((link) => {
      if (!linksBySubmission[link.submission_id]) linksBySubmission[link.submission_id] = [];
      linksBySubmission[link.submission_id].push(link);
    });
    const derived = rawSubmissions.map((submission) => {
      const school = schoolsById[submission.school_id] || null;
      const studentLinks = (linksBySubmission[submission.id] || []).sort((a, b) => a.display_order - b.display_order);
      const linkedStudents = studentLinks.map((link) => studentsById[link.student_id]).filter(Boolean);
      const buildRound = (roundNumber) => {
        const records = evaluationRecords.filter((r) => r.submission_id === submission.id && r.round_number === roundNumber);
        const roundKey = roundNumber === 1 ? "round1" : "round2";
        const state = { evaluator_ids: [], evaluator_names: [], evaluation_date: "", per_evaluator: {}, completed: records.length > 0 };
        records.forEach((record) => {
          if (!state.evaluator_ids.includes(record.evaluator_id)) {
            state.evaluator_ids.push(record.evaluator_id);
            state.evaluator_names.push(evaluatorNames[record.evaluator_id] || record.evaluator_id);
          }
          state.evaluation_date = record.evaluation_date || state.evaluation_date;
          state.per_evaluator[record.evaluator_id] = { scores: record.scores_json || {}, comments: record.comments || "", completed: true };
        });
        state.aggregate = calculateAggregate(state, getRubric(submission.pathway, submission.sub_pathway, roundKey), evaluatorNames);
        return state;
      };
      const round1 = buildRound(1);
      const round2 = buildRound(2);
      const round1Effective = {
        totalScore: submission.management_round1_total_score ?? round1.aggregate.totalScore,
        grade: submission.management_round1_grade || round1.aggregate.grade || "",
        identityValue: round1.aggregate.identityValue,
        commentsSummary: submission.management_round1_comments || round1.aggregate.commentsSummary || ""
      };
      const round2Effective = {
        totalScore: submission.management_round2_total_score ?? round2.aggregate.totalScore,
        grade: submission.management_round2_grade || round2.aggregate.grade || "",
        identityValue: submission.management_round2_national_identity === null || submission.management_round2_national_identity === undefined ? round2.aggregate.identityValue : (submission.management_round2_national_identity ? 100 : 0),
        commentsSummary: submission.management_round2_comments || round2.aggregate.commentsSummary || ""
      };
      return {
        ...submission,
        school_name: school?.school_name || "",
        school_esis: school?.school_esis || "",
        school_type: school?.school_type || "Unspecified",
        region: school?.region || "",
        students: linkedStudents,
        assigned_coordinator_name: submission.assigned_coordinator_id ? (usersById[submission.assigned_coordinator_id]?.username || "") : "",
        round1: { ...round1, effective: round1Effective, autoAdvanced: round1.completed ? passesRound1(submission.pathway, round1Effective) : false },
        round2: { ...round2, effective: round2Effective, finalSelected: round2.completed ? isFinalSelected(submission.pathway, round2Effective) : false }
      };
    });
    setSubmissions(derived);
    setSelectedSubmissionId((prev) => prev || derived[0]?.id || "");
  }, [loading, schools, students, users, evaluators, rawSubmissions, evaluationRecords, submissionStudents]);

  const coordinators = useMemo(() => users.filter((u) => u.role === "coordinator"), [users]);
  const evaluatorNameMap = useMemo(() => Object.fromEntries(evaluators.map((item) => [item.id, item.name])), [evaluators]);
  const pathwayOptions = useMemo(() => Array.from(new Set(submissions.map((s) => s.pathway).filter(Boolean))), [submissions]);
  const schoolNames = useMemo(() => Array.from(new Set(submissions.map((s) => s.school_name).filter(Boolean))).sort(), [submissions]);
  const schoolTypes = useMemo(() => Array.from(new Set(submissions.map((s) => s.school_type || "Unspecified").filter(Boolean))).sort(), [submissions]);
  const regions = useMemo(() => Array.from(new Set(submissions.map((s) => s.region || "Unspecified").filter(Boolean))).sort(), [submissions]);
  const gradeOptions = useMemo(() => Array.from(new Set(students.map((s) => s.grade).filter(Boolean))).sort(), [students]);
  const nationalityOptions = useMemo(() => Array.from(new Set(students.map((s) => s.nationality).filter(Boolean))).sort(), [students]);

  const workspaceEvaluators = useMemo(() => sessionDraft.pathway ? evaluators.filter((e) => e.active && (e.pathways || []).includes(sessionDraft.pathway)) : [], [evaluators, sessionDraft.pathway]);

  const workspaceQueue = useMemo(() => {
    if (!sessionState.loaded || !sessionState.pathway) return [];
    return submissions.filter((submission) => {
      const pathwayOk = submission.pathway === sessionState.pathway;
      const roleOk = currentUser.role === "admin" || submission.assigned_coordinator_id === currentUser.sub;
      const roundOk = sessionState.round === "round1" ? true : submission.round1.autoAdvanced;
      const searchOk = !workspaceSearch || `${submission.artwork_name} ${submission.school_name} ${submission.students.map((s) => s.student_name).join(" ")} ${submission.sub_pathway || ""}`.toLowerCase().includes(workspaceSearch.toLowerCase());
      return pathwayOk && roleOk && roundOk && searchOk;
    });
  }, [sessionState, submissions, workspaceSearch, currentUser]);

  useEffect(() => {
    if (workspaceQueue.length && !workspaceQueue.some((item) => item.id === selectedSubmissionId)) setSelectedSubmissionId(workspaceQueue[0].id);
  }, [workspaceQueue, selectedSubmissionId]);

  const selectedSubmission = useMemo(() => submissions.find((item) => item.id === selectedSubmissionId) || null, [submissions, selectedSubmissionId]);
  const currentRoundKey = sessionState.round;
  const currentRubric = selectedSubmission ? getRubric(selectedSubmission.pathway, selectedSubmission.sub_pathway, currentRoundKey) : null;

  useEffect(() => {
    if (!selectedSubmission || !sessionState.loaded) return;
    setDraftEvaluations((prev) => {
      const submissionDraft = prev[selectedSubmission.id] || {};
      if (submissionDraft[currentRoundKey] && JSON.stringify(submissionDraft[currentRoundKey].evaluator_ids) === JSON.stringify(sessionState.evaluatorIds)) return prev;
      const stored = currentRoundKey === "round1" ? selectedSubmission.round1 : selectedSubmission.round2;
      const per = {};
      sessionState.evaluatorIds.forEach((id) => { per[id] = { scores: stored.per_evaluator?.[id]?.scores || {}, comments: stored.per_evaluator?.[id]?.comments || "" }; });
      return { ...prev, [selectedSubmission.id]: { ...submissionDraft, [currentRoundKey]: { evaluator_ids: sessionState.evaluatorIds, evaluation_date: sessionState.evaluationDate, per_evaluator: per } } };
    });
  }, [selectedSubmission, currentRoundKey, sessionState]);

  const selectedDraft = selectedSubmission ? draftEvaluations[selectedSubmission.id]?.[currentRoundKey] : null;
  const draftAggregate = useMemo(() => selectedDraft ? calculateAggregate(selectedDraft, currentRubric, evaluatorNameMap) : { totalScore: 0, grade: "", identityValue: null, scoredBy: 0, commentsSummary: "" }, [selectedDraft, currentRubric, evaluatorNameMap]);

  const stats = useMemo(() => ({
    total: submissions.length,
    evaluatedOnline: submissions.filter((s) => s.round1.completed).length,
    shortlisted: submissions.filter((s) => s.round1.autoAdvanced).length,
    evaluatedPhysically: submissions.filter((s) => s.round2.completed).length,
    finals: submissions.filter((s) => s.round2.finalSelected).length
  }), [submissions]);

  const allSubmissions = useMemo(() => submissions.filter((submission) => {
    const pathwayOk = allFilters.pathway === "all" || submission.pathway === allFilters.pathway;
    const schoolOk = allFilters.schoolName === "all" || submission.school_name === allFilters.schoolName;
    const schoolTypeOk = allFilters.schoolType === "all" || submission.school_type === allFilters.schoolType;
    const regionOk = allFilters.region === "all" || submission.region === allFilters.region;
    const coordinatorOk = allFilters.coordinator === "all" || submission.assigned_coordinator_id === allFilters.coordinator;
    const statusOk = statusMatch(submission, allFilters.status);
    const flagOk = boolFilter(submission.seen_reviewed, allFilters.seen_reviewed) && boolFilter(submission.need_fixing_school, allFilters.need_fixing_school) && boolFilter(submission.need_fixing_internal, allFilters.need_fixing_internal);
    const searchOk = !allFilters.search || `${submission.submission_code || ""} ${submission.artwork_name} ${submission.school_name} ${submission.students.map((s) => s.student_name).join(" ")} ${submission.pathway} ${submission.sub_pathway || ""}`.toLowerCase().includes(allFilters.search.toLowerCase());
    return pathwayOk && schoolOk && schoolTypeOk && regionOk && coordinatorOk && statusOk && flagOk && searchOk;
  }), [submissions, allFilters]);

  const finalSelections = useMemo(() => submissions.filter((s) => s.round2.finalSelected && (finalFilter === "all" || s.pathway === finalFilter)), [submissions, finalFilter]);

  const filteredForDashboard = useMemo(() => submissions.filter((submission) => {
    const pathwayOk = dashboardFilterPathway === "all" || submission.pathway === dashboardFilterPathway;
    const schoolTypeOk = dashboardFilterSchoolType === "all" || submission.school_type === dashboardFilterSchoolType;
    const regionOk = dashboardFilterRegion === "all" || submission.region === dashboardFilterRegion;
    const coordinatorOk = dashboardFilterCoordinator === "all" || submission.assigned_coordinator_id === dashboardFilterCoordinator;
    return pathwayOk && schoolTypeOk && regionOk && coordinatorOk;
  }), [submissions, dashboardFilterPathway, dashboardFilterSchoolType, dashboardFilterRegion, dashboardFilterCoordinator]);

  const dashboardMatched = useMemo(() => {
    if (dashboardStage === "all_submissions") return filteredForDashboard;
    if (dashboardStage === "round1_completed") return filteredForDashboard.filter((s) => s.round1.completed);
    if (dashboardStage === "selected_round2") return filteredForDashboard.filter((s) => s.round1.autoAdvanced);
    if (dashboardStage === "round2_completed") return filteredForDashboard.filter((s) => s.round2.completed);
    return filteredForDashboard.filter((s) => s.round2.finalSelected);
  }, [filteredForDashboard, dashboardStage]);

  const uniqueSchools = useMemo(() => Array.from(new Map(dashboardMatched.map((s) => [s.school_esis, { school_esis: s.school_esis, school_name: s.school_name }])).values()), [dashboardMatched]);
  const uniqueStudents = useMemo(() => {
    const map = new Map();
    dashboardMatched.forEach((submission) => submission.students.forEach((student) => { if (!map.has(student.student_esis)) map.set(student.student_esis, student); }));
    return Array.from(map.values());
  }, [dashboardMatched]);
  const byGender = useMemo(() => Object.entries(uniqueStudents.reduce((acc, s) => { const key = s.gender || "Unspecified"; acc[key] = (acc[key] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value })), [uniqueStudents]);
  const byNationality = useMemo(() => Object.entries(uniqueStudents.reduce((acc, s) => { const key = s.nationality || "Unspecified"; acc[key] = (acc[key] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value })), [uniqueStudents]);
  const byPathway = useMemo(() => Object.entries(dashboardMatched.reduce((acc, s) => { acc[s.pathway] = (acc[s.pathway] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value })), [dashboardMatched]);
  const bySchoolType = useMemo(() => Object.entries(dashboardMatched.reduce((acc, s) => { const key = s.school_type || "Unspecified"; acc[key] = (acc[key] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value })), [dashboardMatched]);
  const perPathwayAnalytics = useMemo(() => pathwayOptions.map((pathway) => {
    const group = dashboardMatched.filter((s) => s.pathway === pathway);
    const schoolsSet = new Set(group.map((s) => s.school_esis).filter(Boolean));
    const studentsSet = new Set();
    group.forEach((submission) => submission.students.forEach((student) => studentsSet.add(student.student_esis)));
    return { pathway, schools: schoolsSet.size, students: studentsSet.size, submissions: group.length };
  }), [dashboardMatched, pathwayOptions]);

  const studentRows = useMemo(() => {
    const linksByStudent = {};
    submissionStudents.forEach((link) => {
      if (!linksByStudent[link.student_id]) linksByStudent[link.student_id] = [];
      linksByStudent[link.student_id].push(link.submission_id);
    });
    return students.filter((student) => {
      const school = schools.find((s) => s.id === student.school_id);
      const gradeOk = studentFilters.grade === "all" || student.grade === studentFilters.grade;
      const schoolOk = studentFilters.school === "all" || school?.school_name === studentFilters.school;
      const natOk = studentFilters.nationality === "all" || student.nationality === studentFilters.nationality;
      const searchOk = !studentFilters.search || `${student.student_name} ${student.student_esis}`.toLowerCase().includes(studentFilters.search.toLowerCase());
      return gradeOk && schoolOk && natOk && searchOk;
    }).map((student) => {
      const school = schools.find((s) => s.id === student.school_id);
      const projectIds = linksByStudent[student.id] || [];
      return { ...student, school_name: school?.school_name || "", projects: submissions.filter((s) => projectIds.includes(s.id)) };
    });
  }, [students, schools, submissionStudents, submissions, studentFilters]);

  const schoolRows = useMemo(() => schools.filter((school) => {
    const typeOk = schoolFilters.schoolType === "all" || (school.school_type || "Unspecified") === schoolFilters.schoolType;
    const regionOk = schoolFilters.region === "all" || (school.region || "Unspecified") === schoolFilters.region;
    const searchOk = !schoolFilters.search || `${school.school_name} ${school.school_esis}`.toLowerCase().includes(schoolFilters.search.toLowerCase());
    return typeOk && regionOk && searchOk;
  }).map((school) => ({ ...school, projects: submissions.filter((s) => s.school_id === school.id) })), [schools, submissions, schoolFilters]);

  const selectedStudent = useMemo(() => studentRows.find((s) => s.id === selectedStudentId) || studentRows[0] || null, [studentRows, selectedStudentId]);
  const selectedSchool = useMemo(() => schoolRows.find((s) => s.id === selectedSchoolId) || schoolRows[0] || null, [schoolRows, selectedSchoolId]);
  useEffect(() => { if (studentRows.length && !studentRows.some((s) => s.id === selectedStudentId)) setSelectedStudentId(studentRows[0].id); }, [studentRows, selectedStudentId]);
  useEffect(() => { if (schoolRows.length && !schoolRows.some((s) => s.id === selectedSchoolId)) setSelectedSchoolId(schoolRows[0].id); }, [schoolRows, selectedSchoolId]);

  const coordinatorProgress = useMemo(() => coordinators.map((coordinator) => {
    const assigned = submissions.filter((s) => s.assigned_coordinator_id === coordinator.id);
    return {
      ...coordinator,
      assigned: assigned.length,
      round1Completed: assigned.filter((s) => s.round1.completed).length,
      shortlisted: assigned.filter((s) => s.round1.autoAdvanced).length,
      round2Completed: assigned.filter((s) => s.round2.completed).length,
      finalSelected: assigned.filter((s) => s.round2.finalSelected).length
    };
  }), [coordinators, submissions]);
  const coordinatorTotals = useMemo(() => ({
    assigned: coordinatorProgress.reduce((sum, row) => sum + row.assigned, 0),
    round1Completed: coordinatorProgress.reduce((sum, row) => sum + row.round1Completed, 0),
    shortlisted: coordinatorProgress.reduce((sum, row) => sum + row.shortlisted, 0),
    round2Completed: coordinatorProgress.reduce((sum, row) => sum + row.round2Completed, 0),
    finalSelected: coordinatorProgress.reduce((sum, row) => sum + row.finalSelected, 0)
  }), [coordinatorProgress]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function toggleSessionEvaluator(id) {
    setSessionDraft((prev) => ({ ...prev, loaded: false, evaluatorIds: prev.evaluatorIds.includes(id) ? prev.evaluatorIds.filter((x) => x !== id) : [...prev.evaluatorIds, id] }));
  }

  function loadWorkspace() {
    if (!sessionDraft.pathway || !sessionDraft.evaluatorIds.length || !sessionDraft.evaluationDate) return;
    setSessionState({ ...sessionDraft, loaded: true });
    setDraftEvaluations({});
  }

  function updateScore(evaluatorId, criterionKey, value) {
    if (!selectedSubmission) return;
    setDraftEvaluations((prev) => {
      const submissionDraft = prev[selectedSubmission.id] || {};
      const roundDraft = submissionDraft[currentRoundKey] || { evaluator_ids: sessionState.evaluatorIds, evaluation_date: sessionState.evaluationDate, per_evaluator: {} };
      const evaluatorDraft = roundDraft.per_evaluator[evaluatorId] || { scores: {}, comments: "" };
      return {
        ...prev,
        [selectedSubmission.id]: {
          ...submissionDraft,
          [currentRoundKey]: {
            ...roundDraft,
            evaluator_ids: sessionState.evaluatorIds,
            evaluation_date: sessionState.evaluationDate,
            per_evaluator: {
              ...roundDraft.per_evaluator,
              [evaluatorId]: { ...evaluatorDraft, scores: { ...evaluatorDraft.scores, [criterionKey]: value } }
            }
          }
        }
      };
    });
  }

  function updateComment(evaluatorId, value) {
    if (!selectedSubmission) return;
    setDraftEvaluations((prev) => {
      const submissionDraft = prev[selectedSubmission.id] || {};
      const roundDraft = submissionDraft[currentRoundKey] || { evaluator_ids: sessionState.evaluatorIds, evaluation_date: sessionState.evaluationDate, per_evaluator: {} };
      const evaluatorDraft = roundDraft.per_evaluator[evaluatorId] || { scores: {}, comments: "" };
      return {
        ...prev,
        [selectedSubmission.id]: {
          ...submissionDraft,
          [currentRoundKey]: {
            ...roundDraft,
            evaluator_ids: sessionState.evaluatorIds,
            evaluation_date: sessionState.evaluationDate,
            per_evaluator: {
              ...roundDraft.per_evaluator,
              [evaluatorId]: { ...evaluatorDraft, comments: value }
            }
          }
        }
      };
    });
  }

  async function saveCurrentEvaluation() {
    if (!selectedSubmission || !selectedDraft) return;
    const response = await fetch("/api/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submission_id: selectedSubmission.id,
        round_number: currentRoundKey === "round1" ? 1 : 2,
        evaluator_ids: sessionState.evaluatorIds,
        evaluation_date: sessionState.evaluationDate,
        per_evaluator: selectedDraft.per_evaluator
      })
    });
    const data = await response.json();
    if (!response.ok) { alert(data.error || "Failed to save evaluation."); return; }
    await bootstrap();
  }

  async function saveSubmissionDetails(id, draft) {
    const response = await fetch(`/api/submissions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...draft,
        artwork_collected: !!draft.artwork_collected,
        management_round1_total_score: draft.management_round1_total_score === "" ? null : Number(draft.management_round1_total_score),
        management_round2_total_score: draft.management_round2_total_score === "" ? null : Number(draft.management_round2_total_score),
        management_round2_national_identity: draft.management_round2_national_identity === "" ? null : draft.management_round2_national_identity === "yes"
      })
    });
    const data = await response.json();
    if (!response.ok) { alert(data.error || "Failed to save submission details."); return; }
    setDetailSubmission(null);
    await bootstrap();
  }

  async function saveUser(draft) {
    const url = editingUser ? `/api/users/${editingUser.id}` : "/api/users";
    const method = editingUser ? "PATCH" : "POST";
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const data = await response.json();
    if (!response.ok) { alert(data.error || "Failed to save user."); return; }
    setUserModalOpen(false); setEditingUser(null); await bootstrap();
  }

  async function deleteUser(id) {
    if (!confirm("Delete this user?")) return;
    const response = await fetch(`/api/users/${id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) { alert(data.error || "Failed to delete user."); return; }
    await bootstrap();
  }

  async function saveEvaluator(draft) {
    const url = editingEvaluator ? `/api/evaluators/${editingEvaluator.id}` : "/api/evaluators";
    const method = editingEvaluator ? "PATCH" : "POST";
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const data = await response.json();
    if (!response.ok) { alert(data.error || "Failed to save evaluator."); return; }
    setEvaluatorModalOpen(false); setEditingEvaluator(null); await bootstrap();
  }

  async function deleteEvaluator(id) {
    if (!confirm("Delete this evaluator?")) return;
    const response = await fetch(`/api/evaluators/${id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) { alert(data.error || "Failed to delete evaluator."); return; }
    await bootstrap();
  }

  async function handleImport(file) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    const response = await fetch("/api/submissions/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
    const data = await response.json();
    if (!response.ok) { alert(data.error || "Import failed."); return; }
    alert(`Imported: ${data.importedCount}\nReuploaded: ${data.reuploadedCount}`);
    await bootstrap();
  }

  function exportEverything(type) {
    const rows = submissions.map((submission) => ({
      SubmissionCode: submission.submission_code,
      Pathway: submission.pathway,
      SubPathway: submission.sub_pathway || "",
      SchoolName: submission.school_name,
      SchoolESIS: submission.school_esis,
      SchoolType: submission.school_type,
      Region: submission.region,
      Coordinator: submission.assigned_coordinator_name || "",
      ArtworkName: submission.artwork_name,
      RegistrationType: submission.registration_type || "",
      NumberOfStudents: submission.number_of_students,
      StudentESIS: submission.students.map((s) => s.student_esis).join("; "),
      StudentNames: submission.students.map((s) => s.student_name).join("; "),
      StudentGrades: submission.students.map((s) => s.grade || "").join("; "),
      StudentGender: submission.students.map((s) => s.gender || "").join("; "),
      StudentNationality: submission.students.map((s) => s.nationality || "").join("; "),
      PreviewURL: submission.preview_url || "",
      SourceFileURL: submission.source_file_url || "",
      SourceFileType: submission.source_file_type || "",
      Medium: submission.medium || "",
      Dimensions: submission.dimensions || "",
      Description: submission.description || "",
      SeenReviewed: submission.seen_reviewed ? "Yes" : "No",
      NeedFixingSchool: submission.need_fixing_school ? "Yes" : "No",
      NeedFixingInternal: submission.need_fixing_internal ? "Yes" : "No",
      ManagementComments: submission.management_comments || "",
      ManagementRound1Score: submission.management_round1_total_score ?? "",
      ManagementRound1Grade: submission.management_round1_grade || "",
      ManagementRound1Comments: submission.management_round1_comments || "",
      Round1Evaluators: submission.round1.evaluator_names.join(", "),
      Round1Date: submission.round1.evaluation_date || "",
      Round1FinalScore: submission.round1.effective.totalScore,
      Round1FinalGrade: submission.round1.effective.grade,
      Round1Comments: submission.round1.effective.commentsSummary,
      Round1Selected: submission.round1.autoAdvanced ? "Yes" : "No",
      ManagementRound2Score: submission.management_round2_total_score ?? "",
      ManagementRound2Grade: submission.management_round2_grade || "",
      ManagementRound2NationalIdentity: submission.management_round2_national_identity === null || submission.management_round2_national_identity === undefined ? "" : (submission.management_round2_national_identity ? "Yes" : "No"),
      ManagementRound2Comments: submission.management_round2_comments || "",
      Round2Evaluators: submission.round2.evaluator_names.join(", "),
      Round2Date: submission.round2.evaluation_date || "",
      Round2FinalScore: submission.round2.effective.totalScore,
      Round2FinalGrade: submission.round2.effective.grade,
      Round2NationalIdentity: submission.round2.effective.identityValue,
      Round2Comments: submission.round2.effective.commentsSummary,
      FinalSelected: submission.round2.finalSelected ? "Yes" : "No"
    })).filter((row) => {
      if (type === "round1") return row.Round1Date || row.Round1FinalScore !== "";
      if (type === "round2") return row.Round2Date || row.Round2FinalScore !== "";
      if (type === "final") return row.FinalSelected === "Yes";
      return true;
    });
    downloadJson(rows, type === "all" ? "nae-all-data" : `nae-${type}`, exportFormat);
  }

  function downloadTemplate() {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      templateColumns(),
      ["1", "Visual Arts", "Painting", "Dunes of Identity", "Example School", "SCH-1001", "Private", "Abu Dhabi", "coord1", "Group", "3", "Student One,Student Two,Student Three", "Grade 11; Grade 11; Grade 11", "Female; Female; Female", "UAE; India; Oman", "eSIS 1001,eSIS 1002,eSIS 1003", "https://example.com/preview.jpg", "https://example.com/file", "Image", "Acrylic", "50 x 70 cm", "Short description"]
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "NAE-submission-import-template.xlsx");
  }

  function exportAnalyticsReport() {
    const reportRows = dashboardMatched.map((s) => ({
      SubmissionCode: s.submission_code,
      Pathway: s.pathway,
      School: s.school_name,
      SchoolType: s.school_type,
      Region: s.region,
      Coordinator: s.assigned_coordinator_name || "",
      Students: s.students.map((st) => st.student_name).join("; "),
      Round1Selected: s.round1.autoAdvanced ? "Yes" : "No",
      FinalSelected: s.round2.finalSelected ? "Yes" : "No"
    }));
    const max = Math.max(1, ...bySchoolType.map((x) => x.value));
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>NAE Analytics</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#1C3E3B}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.card{border:1px solid #D8E0DC;border-radius:16px;padding:14px}.bars{display:grid;gap:8px}.row{display:grid;grid-template-columns:180px 1fr 60px;gap:10px;align-items:center}.bar{height:18px;background:#B2C7C0;border-radius:999px;overflow:hidden}.fill{height:18px;background:#1C3E3B}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #D8E0DC;padding:8px;text-align:left}th{background:#EBE6DF}</style></head><body><h1>NAE Analytics Report</h1><p>Stage: ${dashboardStage}</p><div class="grid"><div class="card"><strong>Submissions</strong><div>${dashboardMatched.length}</div></div><div class="card"><strong>Schools</strong><div>${uniqueSchools.length}</div></div><div class="card"><strong>Students</strong><div>${uniqueStudents.length}</div></div><div class="card"><strong>Final Selected</strong><div>${dashboardMatched.filter((x)=>x.round2.finalSelected).length}</div></div></div><h2>Submissions by School Type</h2><div class="bars">${bySchoolType.map((x)=>`<div class="row"><div>${x.name}</div><div class="bar"><div class="fill" style="width:${(x.value/max)*100}%"></div></div><div>${x.value}</div></div>`).join("")}</div><h2>Gender</h2><ul>${byGender.map((x)=>`<li>${x.name}: ${x.value}</li>`).join("")}</ul><h2>Nationality</h2><ul>${byNationality.map((x)=>`<li>${x.name}: ${x.value}</li>`).join("")}</ul><h2>Per Pathway</h2><table><thead><tr><th>Pathway</th><th>Schools</th><th>Students</th><th>Submissions</th></tr></thead><tbody>${perPathwayAnalytics.map((x)=>`<tr><td>${x.pathway}</td><td>${x.schools}</td><td>${x.students}</td><td>${x.submissions}</td></tr>`).join("")}</tbody></table><h2>Records</h2><table><thead><tr><th>Submission Code</th><th>Pathway</th><th>School</th><th>School Type</th><th>Region</th><th>Coordinator</th><th>Students</th><th>Round 1 Selected</th><th>Final Selected</th></tr></thead><tbody>${reportRows.map((row)=>`<tr><td>${row.SubmissionCode}</td><td>${row.Pathway}</td><td>${row.School}</td><td>${row.SchoolType}</td><td>${row.Region}</td><td>${row.Coordinator}</td><td>${row.Students}</td><td>${row.Round1Selected}</td><td>${row.FinalSelected}</td></tr>`).join("")}</tbody></table></body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nae-analytics-report.html";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="page"><div className="container"><div className="card">Loading platform…</div></div></div>;

  return (
    <div className="page">
      <PreviewModal open={!!previewUrl} imageUrl={previewUrl} onClose={() => setPreviewUrl("")} />
      <DetailModal open={!!detailSubmission} submission={detailSubmission} currentUser={currentUser} coordinators={coordinators} onClose={() => setDetailSubmission(null)} onSave={saveSubmissionDetails} onOpenPreview={setPreviewUrl} />
      <UserModal open={userModalOpen} user={editingUser} onClose={() => { setUserModalOpen(false); setEditingUser(null); }} onSave={saveUser} />
      <EvaluatorModal open={evaluatorModalOpen} evaluator={editingEvaluator} onClose={() => { setEvaluatorModalOpen(false); setEditingEvaluator(null); }} onSave={saveEvaluator} />
      <FiltersModal open={filtersOpen} onClose={() => setFiltersOpen(false)} tempFilters={tempFilters} setTempFilters={setTempFilters} pathwayOptions={pathwayOptions} schoolNames={schoolNames} schoolTypes={schoolTypes} regions={regions} coordinators={coordinators} onApply={() => { setAllFilters(tempFilters); setFiltersOpen(false); }} onClear={() => { setAllFilters(emptyFilterState); setTempFilters(emptyFilterState); }} />
      <div className="container">
        <div className="hero">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: 3, textTransform: "uppercase", opacity: 0.75 }}>National Art Expressions</div>
              <div style={{ fontSize: 34, fontWeight: 800, marginTop: 8 }}>Evaluation & Selection Platform</div>
            </div>
            <div className="filters-row"><div className="small-card" style={{ background: "rgba(255,255,255,0.12)", color: "white" }}>{currentUser.username} · {currentUser.role}</div><button className="btn outline" onClick={logout}>Logout</button></div>
          </div>
        </div>

        <div className="grid-5">
          <div className="small-card"><div style={{ fontSize: 13, opacity: 0.75 }}>Number of Submissions</div><div style={{ fontSize: 30, fontWeight: 800, marginTop: 6 }}>{stats.total}</div></div>
          <div className="small-card"><div style={{ fontSize: 13, opacity: 0.75 }}>Number of Evaluated Online</div><div style={{ fontSize: 30, fontWeight: 800, marginTop: 6 }}>{stats.evaluatedOnline}</div></div>
          <div className="small-card"><div style={{ fontSize: 13, opacity: 0.75 }}>Number of Shortlisted</div><div className={kpiClass(stats.shortlisted, "shortlist")} style={{ fontSize: 30, fontWeight: 800, marginTop: 6 }}>{stats.shortlisted}</div></div>
          <div className="small-card"><div style={{ fontSize: 13, opacity: 0.75 }}>Number of Evaluated Physically</div><div style={{ fontSize: 30, fontWeight: 800, marginTop: 6 }}>{stats.evaluatedPhysically}</div></div>
          <div className="small-card"><div style={{ fontSize: 13, opacity: 0.75 }}>Number of Final Selected</div><div className={kpiClass(stats.finals, "final")} style={{ fontSize: 30, fontWeight: 800, marginTop: 6 }}>{stats.finals}</div></div>
        </div>

        <div className="tabs">
          {[
            ["workspace", "Workspace"],
            ["all", "All Submissions"],
            ["students", "Students"],
            ["schools", "Schools"],
            ["finals", "Final Selected"],
            ["dashboard", "Dashboard"],
            ["evaluators", "Evaluators"],
            ...(currentUser.role === "admin" ? [["users", "Users"], ["admin", "Import & Export"]] : [])
          ].map(([key, label]) => <button key={key} className={`tab ${activeTab === key ? "active" : ""}`} onClick={() => setActiveTab(key)}>{label}</button>)}
        </div>

        {activeTab === "workspace" && (
          <div className="two-col">
            <div className="card">
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 14 }}>Evaluation Workflow</div>
              <div style={{ display: "grid", gap: 12 }}>
                <select className="field" value={sessionDraft.pathway} onChange={(e) => setSessionDraft((prev) => ({ ...prev, pathway: e.target.value, evaluatorIds: [], loaded: false }))}><option value="">1. Select pathway</option>{pathwayOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 13 }}>2. Select evaluators</div>
                  {workspaceEvaluators.map((item) => <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--border)", borderRadius: 14, padding: 10 }}><input type="checkbox" checked={sessionDraft.evaluatorIds.includes(item.id)} onChange={() => toggleSessionEvaluator(item.id)} /> {item.name}</label>)}
                </div>
                <select className="field" value={sessionDraft.round} onChange={(e) => setSessionDraft((prev) => ({ ...prev, round: e.target.value, loaded: false }))}><option value="round1">3. Round 1</option><option value="round2">3. Round 2</option></select>
                <input className="field" type="date" value={sessionDraft.evaluationDate} onChange={(e) => setSessionDraft((prev) => ({ ...prev, evaluationDate: e.target.value, loaded: false }))} />
                <button className="btn" onClick={loadWorkspace}>5. Load Artworks</button>
                <div className="legend-note">Only evaluators appear here. Coordinators can only work on submissions assigned to them. Admin can view all submissions in all other pages.</div>
                <input className="field" placeholder="Search loaded artworks" value={workspaceSearch} onChange={(e) => setWorkspaceSearch(e.target.value)} />
                <div style={{ display: "grid", gap: 10, maxHeight: 520, overflow: "auto" }}>
                  {workspaceQueue.map((submission) => <button key={submission.id} className="small-card" style={{ textAlign: "left", background: selectedSubmissionId === submission.id ? "var(--mist)" : "white", cursor: "pointer" }} onClick={() => setSelectedSubmissionId(submission.id)}><div style={{ fontWeight: 800 }}>{submission.artwork_name}</div><div style={{ fontSize: 13, opacity: 0.75, marginTop: 6 }}>{submission.school_name} · {submission.students.map((s) => s.student_name).join(", ")}</div><div style={{ marginTop: 8 }}><span className="badge">{submission.pathway}</span>{submission.sub_pathway ? <span className="badge-outline">{submission.sub_pathway}</span> : null}</div></button>)}
                  {!workspaceQueue.length ? <div className="small-card">Load a valid session to see artworks here.</div> : null}
                </div>
              </div>
            </div>

            <div>
              {selectedSubmission ? (
                <div className="eval-layout">
                  <div style={{ display: "grid", gap: 16 }}>
                    <div className="card">
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><span className="badge">{selectedSubmission.pathway}</span>{selectedSubmission.sub_pathway ? <span className="badge-outline">{selectedSubmission.sub_pathway}</span> : null}<span className="badge-soft">{selectedSubmission.submission_code}</span></div>
                      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 10 }}>{selectedSubmission.artwork_name}</div>
                      <div style={{ fontSize: 14, opacity: 0.75, marginTop: 4 }}>{selectedSubmission.school_name} · {selectedSubmission.region || "-"}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
                        <div className="small-card" style={{ background: "var(--sand)" }}><strong>Students</strong><div style={{ marginTop: 8, lineHeight: 1.8 }}>{selectedSubmission.students.map((s) => <div key={s.student_esis}>{s.student_name} · {s.grade || "-"} · {s.gender || "-"} · {s.nationality || "-"}</div>)}</div></div>
                        <div className="small-card" style={{ background: "var(--mist)" }}><strong>Session</strong><div style={{ marginTop: 8, lineHeight: 1.8 }}><div>Evaluators: {sessionState.evaluatorIds.map((id) => evaluatorNameMap[id]).join(", ") || "-"}</div><div>Round: {currentRoundKey === "round1" ? "Round 1" : "Round 2"}</div><div>Date: {sessionState.evaluationDate || "-"}</div><div>Scored By: {draftAggregate.scoredBy || 0}</div></div></div>
                      </div>
                      <div className="small-card" style={{ marginTop: 12 }}><strong>Description</strong><div style={{ marginTop: 8 }}>{selectedSubmission.description || "No description provided."}</div></div>
                      {currentRoundKey === "round2" && selectedSubmission.round1.effective.commentsSummary ? <div className="small-card" style={{ marginTop: 12, background: "var(--sand)" }}><strong>Round 1 Comments</strong><pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{selectedSubmission.round1.effective.commentsSummary}</pre></div> : null}
                    </div>

                    <div className="card">
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
                        <div style={{ fontSize: 22, fontWeight: 800 }}>{currentRoundKey === "round1" ? "Round 1 Evaluation" : "Round 2 Evaluation"}</div>
                        <div><span className="badge-soft">Score: {draftAggregate.totalScore || 0}</span>{draftAggregate.grade ? <span className="badge-outline">Grade: {draftAggregate.grade}</span> : null}{currentRoundKey === "round1" && selectedSubmission.round1.autoAdvanced ? <span className="badge">Round 1 Selected</span> : null}{currentRoundKey === "round2" && selectedSubmission.round2.finalSelected ? <span className="badge">Final Selected</span> : null}</div>
                      </div>
                      <div className="legend-note" style={{ marginBottom: 12 }}>Enter one criterion per row, then one evaluator score after the other across the columns.</div>
                      <div className="score-grid">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Criterion</th>
                              {sessionState.evaluatorIds.map((id) => <th key={id}>{evaluatorNameMap[id]}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {(currentRubric?.criteria || []).map((criterion) => (
                              <tr key={criterion.key}>
                                <td><div style={{ fontWeight: 700 }}>{criterion.label}</div><div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>{criterion.binary ? "Yes / No" : `Weight ${Math.round(criterion.weight * 100)}%`}</div></td>
                                {sessionState.evaluatorIds.map((id) => {
                                  const value = selectedDraft?.per_evaluator?.[id]?.scores?.[criterion.key];
                                  return (
                                    <td key={`${criterion.key}-${id}`}>
                                      {criterion.binary ? (
                                        <select className="field" value={value === 100 ? "yes" : value === 0 ? "no" : ""} onChange={(e) => updateScore(id, criterion.key, e.target.value === "yes" ? 100 : 0)}>
                                          <option value="">Not set</option><option value="yes">Yes</option><option value="no">No</option>
                                        </select>
                                      ) : (
                                        <input className="field" type="number" min="0" max={criterion.max} value={value ?? ""} onChange={(e) => updateScore(id, criterion.key, Math.max(0, Math.min(criterion.max, Number(e.target.value || 0))))} />
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, sessionState.evaluatorIds.length)}, 1fr)`, gap: 12, marginTop: 16 }}>
                        {sessionState.evaluatorIds.map((id) => <div key={id} className="small-card"><div style={{ fontWeight: 700, marginBottom: 8 }}>{evaluatorNameMap[id]} comments</div><textarea className="textarea" value={selectedDraft?.per_evaluator?.[id]?.comments || ""} onChange={(e) => updateComment(id, e.target.value)} /></div>)}
                      </div>
                      <div className="filters-row" style={{ marginTop: 16 }}><button className="btn" onClick={saveCurrentEvaluation}>Save Evaluation</button></div>
                    </div>
                  </div>
                  <div className="sticky-preview">
                    <div className="card">
                      <div style={{ fontWeight: 700, marginBottom: 10 }}>Floating Preview</div>
                      <div style={{ borderRadius: 16, overflow: "hidden", background: "var(--sand)", minHeight: 220 }}>{selectedSubmission.preview_url ? <img src={selectedSubmission.preview_url} alt={selectedSubmission.artwork_name} style={{ width: "100%", display: "block" }} /> : <div style={{ padding: 40, textAlign: "center" }}>No preview</div>}</div>
                      <div className="filters-row" style={{ marginTop: 12 }}>
                        {selectedSubmission.preview_url ? <button className="btn soft" onClick={() => setPreviewUrl(selectedSubmission.preview_url)}>Open Preview</button> : null}
                        {selectedSubmission.source_file_url ? <a className="btn" href={selectedSubmission.source_file_url} target="_blank" rel="noreferrer">Open Source File</a> : null}
                        <button className="btn outline" onClick={() => setDetailSubmission(selectedSubmission)}>View Full Details</button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : <div className="card">Load a session to start evaluating.</div>}
            </div>
          </div>
        )}

        {activeTab === "all" && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>All Submissions</div>
              <div className="filters-row"><button className="btn outline" onClick={() => { setTempFilters(allFilters); setFiltersOpen(true); }}>Open Filters</button><div className="small-card" style={{ padding: "10px 14px" }}>{allSubmissions.length} result(s)</div></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              {allSubmissions.map((submission) => <SubmissionCard key={submission.id} submission={submission} onOpenDetails={setDetailSubmission} onOpenPreview={setPreviewUrl} />)}
              {!allSubmissions.length ? <div className="small-card">No submissions match the current filters.</div> : null}
            </div>
          </div>
        )}

        {activeTab === "students" && (
          <div className="two-col">
            <div className="card">
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 14 }}>Students</div>
              <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
                <select className="field" value={studentFilters.grade} onChange={(e) => setStudentFilters((prev) => ({ ...prev, grade: e.target.value }))}><option value="all">All grades</option>{gradeOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                <select className="field" value={studentFilters.school} onChange={(e) => setStudentFilters((prev) => ({ ...prev, school: e.target.value }))}><option value="all">All schools</option>{schoolNames.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                <select className="field" value={studentFilters.nationality} onChange={(e) => setStudentFilters((prev) => ({ ...prev, nationality: e.target.value }))}><option value="all">All nationalities</option>{nationalityOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                <input className="field" placeholder="Search student" value={studentFilters.search} onChange={(e) => setStudentFilters((prev) => ({ ...prev, search: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 10, maxHeight: 620, overflow: "auto" }}>
                {studentRows.map((student) => <button key={student.id} className="small-card" style={{ textAlign: "left", background: selectedStudent?.id === student.id ? "var(--mist)" : "white", cursor: "pointer" }} onClick={() => setSelectedStudentId(student.id)}><div style={{ fontWeight: 800 }}>{student.student_name}</div><div style={{ fontSize: 13, opacity: 0.75, marginTop: 6 }}>{student.student_esis}</div><div style={{ fontSize: 13, opacity: 0.75 }}>{student.school_name} · {student.grade || "-"} · {student.nationality || "-"}</div><div style={{ marginTop: 8 }}><span className="badge-soft">{student.projects.length} project(s)</span></div></button>)}
              </div>
            </div>
            <div className="card">
              {selectedStudent ? (
                <>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{selectedStudent.student_name}</div>
                  <div style={{ opacity: 0.75, marginTop: 4 }}>{selectedStudent.student_esis} · {selectedStudent.school_name}</div>
                  <div style={{ marginTop: 10 }}><span className="badge-outline">{selectedStudent.grade || "No grade"}</span><span className="badge-outline">{selectedStudent.gender || "No gender"}</span><span className="badge-outline">{selectedStudent.nationality || "No nationality"}</span></div>
                  <div style={{ fontWeight: 700, marginTop: 18, marginBottom: 10 }}>Projects</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
                    {selectedStudent.projects.map((submission) => <SubmissionCard key={submission.id} submission={submission} onOpenDetails={setDetailSubmission} onOpenPreview={setPreviewUrl} />)}
                  </div>
                </>
              ) : <div>No student selected.</div>}
            </div>
          </div>
        )}

        {activeTab === "schools" && (
          <div className="two-col">
            <div className="card">
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 14 }}>Schools</div>
              <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
                <select className="field" value={schoolFilters.schoolType} onChange={(e) => setSchoolFilters((prev) => ({ ...prev, schoolType: e.target.value }))}><option value="all">All school types</option>{schoolTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                <select className="field" value={schoolFilters.region} onChange={(e) => setSchoolFilters((prev) => ({ ...prev, region: e.target.value }))}><option value="all">All regions</option>{regions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                <input className="field" placeholder="Search school" value={schoolFilters.search} onChange={(e) => setSchoolFilters((prev) => ({ ...prev, search: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 10, maxHeight: 620, overflow: "auto" }}>
                {schoolRows.map((school) => <button key={school.id} className="small-card" style={{ textAlign: "left", background: selectedSchool?.id === school.id ? "var(--mist)" : "white", cursor: "pointer" }} onClick={() => setSelectedSchoolId(school.id)}><div style={{ fontWeight: 800 }}>{school.school_name}</div><div style={{ fontSize: 13, opacity: 0.75, marginTop: 6 }}>{school.school_esis}</div><div style={{ fontSize: 13, opacity: 0.75 }}>{school.school_type || "Unspecified"} · {school.region || "-"}</div><div style={{ marginTop: 8 }}><span className="badge-soft">{school.projects.length} project(s)</span></div></button>)}
              </div>
            </div>
            <div className="card">
              {selectedSchool ? (
                <>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{selectedSchool.school_name}</div>
                  <div style={{ opacity: 0.75, marginTop: 4 }}>{selectedSchool.school_esis}</div>
                  <div style={{ marginTop: 10 }}><span className="badge-outline">{selectedSchool.school_type || "Unspecified"}</span><span className="badge-outline">{selectedSchool.region || "-"}</span></div>
                  <div style={{ fontWeight: 700, marginTop: 18, marginBottom: 10 }}>Projects</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
                    {selectedSchool.projects.map((submission) => <SubmissionCard key={submission.id} submission={submission} onOpenDetails={setDetailSubmission} onOpenPreview={setPreviewUrl} />)}
                  </div>
                </>
              ) : <div>No school selected.</div>}
            </div>
          </div>
        )}

        {activeTab === "finals" && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>Final Selected</div>
              <div className="filters-row"><select className="field" value={finalFilter} onChange={(e) => setFinalFilter(e.target.value)}><option value="all">All pathways</option>{pathwayOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select><button className="btn" onClick={() => exportEverything("final")}>Export Final</button></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              {finalSelections.map((submission) => <SubmissionCard key={submission.id} submission={submission} onOpenDetails={setDetailSubmission} onOpenPreview={setPreviewUrl} />)}
            </div>
          </div>
        )}

        {activeTab === "dashboard" && (
          <div style={{ display: "grid", gap: 16 }}>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: 22, fontWeight: 800 }}>Dashboard</div>
                <div className="filters-row">
                  <select className="field" value={dashboardStage} onChange={(e) => setDashboardStage(e.target.value)}><option value="all_submissions">All Submissions</option><option value="round1_completed">Round 1 Completed</option><option value="selected_round2">Selected Round 2</option><option value="round2_completed">Round 2 Completed</option><option value="final_selected">Final Selected</option></select>
                  <select className="field" value={dashboardFilterPathway} onChange={(e) => setDashboardFilterPathway(e.target.value)}><option value="all">All pathways</option>{pathwayOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                  <select className="field" value={dashboardFilterSchoolType} onChange={(e) => setDashboardFilterSchoolType(e.target.value)}><option value="all">All school types</option>{schoolTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                  <select className="field" value={dashboardFilterRegion} onChange={(e) => setDashboardFilterRegion(e.target.value)}><option value="all">All regions</option>{regions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                  <select className="field" value={dashboardFilterCoordinator} onChange={(e) => setDashboardFilterCoordinator(e.target.value)}><option value="all">All coordinators</option>{coordinators.map((item) => <option key={item.id} value={item.id}>{item.username}</option>)}</select>
                  <button className="btn outline" onClick={exportAnalyticsReport}>Export Analytics Report</button>
                </div>
              </div>
              <div className="grid-5">
                <div className="small-card"><div style={{ fontSize: 13, opacity: 0.75 }}>Submissions</div><div style={{ fontSize: 30, fontWeight: 800, marginTop: 6 }}>{dashboardMatched.length}</div></div>
                <div className="small-card"><div style={{ fontSize: 13, opacity: 0.75 }}>Total Number of Schools</div><div style={{ fontSize: 30, fontWeight: 800, marginTop: 6 }}>{uniqueSchools.length}</div></div>
                <div className="small-card"><div style={{ fontSize: 13, opacity: 0.75 }}>Number of Students</div><div style={{ fontSize: 30, fontWeight: 800, marginTop: 6 }}>{uniqueStudents.length}</div></div>
                <div className="small-card"><div style={{ fontSize: 13, opacity: 0.75 }}>Pathways</div><div style={{ fontSize: 30, fontWeight: 800, marginTop: 6 }}>{new Set(dashboardMatched.map((x) => x.pathway)).size}</div></div>
                <div className="small-card"><div style={{ fontSize: 13, opacity: 0.75 }}>Final Selected</div><div style={{ fontSize: 30, fontWeight: 800, marginTop: 6 }}>{dashboardMatched.filter((x) => x.round2.finalSelected).length}</div></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                <div className="small-card" style={{ minHeight: 320 }}><div style={{ fontWeight: 700, marginBottom: 10 }}>By Pathway</div><div style={{ width: "100%", height: 260 }}><ResponsiveContainer><PieChart><Pie data={byPathway} dataKey="value" nameKey="name" outerRadius={90} label>{byPathway.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div></div>
                <div className="small-card" style={{ minHeight: 320 }}><div style={{ fontWeight: 700, marginBottom: 10 }}>Gender</div><div style={{ width: "100%", height: 260 }}><ResponsiveContainer><PieChart><Pie data={byGender} dataKey="value" nameKey="name" outerRadius={90} label>{byGender.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div></div>
                <div className="small-card" style={{ minHeight: 320 }}><div style={{ fontWeight: 700, marginBottom: 10 }}>Nationality</div><div style={{ width: "100%", height: 260 }}><ResponsiveContainer><PieChart><Pie data={byNationality} dataKey="value" nameKey="name" outerRadius={90} label>{byNationality.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div></div>
              </div>
              <div className="small-card" style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Submissions by School Type</div>
                <div style={{ width: "100%", height: 320 }}>
                  <ResponsiveContainer>
                    <BarChart data={bySchoolType}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" fill="#1C3E3B" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 14 }}>Separate Analytics Per Pathway</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
                {perPathwayAnalytics.map((item) => <div key={item.pathway} className="small-card"><div style={{ fontWeight: 700, marginBottom: 10 }}>{item.pathway}</div><div style={{ lineHeight: 1.8 }}><div>Total Number of Schools: <strong>{item.schools}</strong></div><div>Number of Students: <strong>{item.students}</strong></div><div>Number of Submissions: <strong>{item.submissions}</strong></div></div></div>)}
              </div>
            </div>
          </div>
        )}

        {activeTab === "evaluators" && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>Evaluators</div>
              <button className="btn" onClick={() => { setEditingEvaluator(null); setEvaluatorModalOpen(true); }}>Add Evaluator</button>
            </div>
            <div className="legend-note" style={{ marginBottom: 14 }}>Evaluators are separate from platform users. Both admin and coordinators can access this page.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              {evaluators.map((item) => (
                <div key={item.id} className="small-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div><div style={{ fontWeight: 800 }}>{item.name}</div><div style={{ fontSize: 13, opacity: 0.75 }}>{item.active ? "Active" : "Inactive"}</div></div>
                    <div className="filters-row"><button className="btn outline" onClick={() => { setEditingEvaluator(item); setEvaluatorModalOpen(true); }}>Edit</button><button className="btn outline" onClick={() => deleteEvaluator(item.id)}>Delete</button></div>
                  </div>
                  <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                    {pathwayOptions.map((pathway) => <label key={pathway} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--border)", borderRadius: 14, padding: 10 }}><input type="checkbox" checked={(item.pathways || []).includes(pathway)} onChange={async () => { const next = (item.pathways || []).includes(pathway) ? item.pathways.filter((x) => x !== pathway) : [...(item.pathways || []), pathway]; await fetch(`/api/evaluators/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pathways: next }) }); await bootstrap(); }} /> {pathway}</label>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "users" && currentUser.role === "admin" && (
          <div style={{ display: "grid", gap: 16 }}>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><div style={{ fontSize: 22, fontWeight: 800 }}>Users</div><button className="btn" onClick={() => { setEditingUser(null); setUserModalOpen(true); }}>Add User</button></div>
              <table className="table"><thead><tr><th>Username</th><th>Display Name</th><th>Role</th><th>Active</th><th>Pathways</th><th></th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td>{user.username}</td><td>{user.display_name || "-"}</td><td>{user.role}</td><td>{user.active ? "Yes" : "No"}</td><td>{(user.pathways || []).join(", ") || "-"}</td><td><div className="filters-row"><button className="btn outline" onClick={() => { setEditingUser(user); setUserModalOpen(true); }}>Edit</button>{user.username !== "Admin" ? <button className="btn outline" onClick={() => deleteUser(user.id)}>Delete</button> : null}</div></td></tr>)}</tbody></table>
            </div>
            <div className="card">
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 14 }}>Coordinator Progress</div>
              <table className="table"><thead><tr><th>Coordinator</th><th>Assigned Artworks</th><th>Round 1 Completed</th><th>Shortlisted</th><th>Round 2 Completed</th><th>Final Selected</th></tr></thead><tbody>{coordinatorProgress.map((row) => <tr key={row.id}><td>{row.username}</td><td>{row.assigned}</td><td>{row.round1Completed}</td><td>{row.shortlisted}</td><td>{row.round2Completed}</td><td>{row.finalSelected}</td></tr>)}<tr style={{ fontWeight: 800, background: "var(--sand)" }}><td>Total</td><td>{coordinatorTotals.assigned}</td><td>{coordinatorTotals.round1Completed}</td><td>{coordinatorTotals.shortlisted}</td><td>{coordinatorTotals.round2Completed}</td><td>{coordinatorTotals.finalSelected}</td></tr></tbody></table>
            </div>
          </div>
        )}

        {activeTab === "admin" && currentUser.role === "admin" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="card">
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 14 }}>Import Submissions</div>
              <div className="legend-note" style={{ marginBottom: 14 }}>The template includes Coordinator Username, School eSIS, and Student eSIS.</div>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])} />
              <div className="filters-row" style={{ marginTop: 14 }}><button className="btn outline" onClick={downloadTemplate}>Download Template</button></div>
            </div>
            <div className="card">
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 14 }}>Export Data</div>
              <div style={{ marginBottom: 12 }}><div style={{ fontSize: 13, marginBottom: 6 }}>Export Format</div><select className="field" value={exportFormat} onChange={(e) => setExportFormat(e.target.value)}><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV (.csv)</option></select></div>
              <div className="filters-row"><button className="btn" onClick={() => exportEverything("round1")}>Export Round 1</button><button className="btn" onClick={() => exportEverything("round2")}>Export Round 2</button><button className="btn" onClick={() => exportEverything("final")}>Export Final Selected</button><button className="btn outline" onClick={() => exportEverything("all")}>Export Everything</button></div>
              <div className="legend-note" style={{ marginTop: 14 }}>Exports include all submission fields, student-level data, flags, management comments, round 1 and round 2 results, national identity, and evaluator comments.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
