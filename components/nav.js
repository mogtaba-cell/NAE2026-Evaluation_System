// Role navigation. Shared by the server (home redirect) and the client shell.
export const HOME = { admin: "/dashboard", coordinator: "/dashboard", evaluator: "/queue", management: "/dashboard", storage: "/dashboard", leadership: "/dashboard", proofreader: "/proofreading", reviewer: "/proofreading" };
export const NAV = {
  admin: [
    ["Overview", [["/dashboard", "Dashboard"]]],
    ["Setup", [["/setup", "Program setup"], ["/rubrics", "Rubric library"], ["/import", "Data import"], ["/people", "People and logins"]]],
    ["Operations", [["/entries", "Artworks"], ["/schools", "Schools"], ["/students", "Students"], ["/files", "Submission files"], ["/allocation", "Artwork Distribution"], ["/rounds", "Rounds and results"], ["/sessions", "Evaluations"], ["/corrections", "Corrections"], ["/proofreading", "Proofreading and review"], ["/reviews", "Management Review", "reviews"], ["/logistics", "Artwork logistics"]]],
    ["Insights", [["/insights", "Insights"], ["/reports", "Reports and exports"], ["/final-results", "Final results"], ["/audit", "Audit log"]]]
  ],
  coordinator: [
    ["Work", [["/dashboard", "My dashboard"], ["/sessions", "Evaluations"], ["/corrections", "Corrections"], ["/entries", "My artworks"], ["/entries?scope=all", "All artworks"], ["/schools", "Schools"], ["/students", "Students"]]],
    ["Artwork", [["/pull-list", "Session boards"], ["/collections", "Collections"], ["/logistics", "Artwork logistics"]]]
  ],
  evaluator: [["Scoring", [["/queue", "My queue", "queue"], ["/sessions", "My evaluations"]]]],
  storage: [["Logistics", [["/dashboard", "Dashboard"], ["/logistics", "Artwork logistics"], ["/pull-list", "Session boards"], ["/collections", "Collections"]]]],
  management: [["Review", [["/dashboard", "Dashboard"], ["/reviews", "Management Review", "reviews"], ["/corrections", "Corrections"], ["/proofreading", "Proofreading and review"], ["/entries", "Artworks"], ["/schools", "Schools"], ["/students", "Students"]]], ["Insights", [["/insights", "Insights"], ["/final-results", "Final results"], ["/reports", "Reports"]]]],
  proofreader: [["Selected artworks", [["/proofreading", "Proofreading", "proof"]]]],
  reviewer: [["Selected artworks", [["/proofreading", "Final review", "proof"]]]],
  leadership: [["HQ", [["/dashboard", "Overview"], ["/final-results", "Final results"], ["/entries", "Artworks"], ["/schools", "Schools"], ["/students", "Students"], ["/reports", "Reports"]]]]
};
