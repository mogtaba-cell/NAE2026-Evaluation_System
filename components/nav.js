// Role navigation. Shared by the server (home redirect) and the client shell.
export const HOME = { admin: "/dashboard", coordinator: "/dashboard", evaluator: "/queue", management: "/dashboard", storage: "/dashboard", leadership: "/dashboard" };
export const NAV = {
  admin: [
    ["Overview", [["/dashboard", "Dashboard"]]],
    ["Setup", [["/setup", "Program setup"], ["/rubrics", "Rubric library"], ["/import", "Data import"], ["/people", "People and logins"]]],
    ["Operations", [["/entries", "Artworks"], ["/schools", "Schools"], ["/students", "Students"], ["/files", "Submission files"], ["/allocation", "Allocation"], ["/rounds", "Rounds and results"], ["/sessions", "Scoring sessions"], ["/reviews", "Reviews", "reviews"], ["/logistics", "Artwork logistics"]]],
    ["Insights", [["/insights", "Insights"], ["/reports", "Reports and exports"], ["/final-results", "Final results"], ["/audit", "Audit log"]]]
  ],
  coordinator: [
    ["Work", [["/dashboard", "My dashboard"], ["/sessions", "Scoring sessions"], ["/entries", "My artworks"], ["/entries?scope=all", "All artworks"], ["/schools", "Schools"], ["/students", "Students"]]],
    ["Artwork", [["/pull-list", "Session boards"], ["/collections", "Collections"], ["/logistics", "Artwork logistics"]]]
  ],
  evaluator: [["Scoring", [["/queue", "My queue", "queue"]]]],
  storage: [["Logistics", [["/dashboard", "Dashboard"], ["/logistics", "Artwork logistics"], ["/pull-list", "Session boards"], ["/collections", "Collections"]]]],
  management: [["Review", [["/dashboard", "Dashboard"], ["/reviews?mine=1", "My reviews", "reviews"], ["/entries", "Artworks"], ["/schools", "Schools"], ["/students", "Students"]]], ["Insights", [["/insights", "Insights"], ["/final-results", "Final results"], ["/reports", "Reports"]]]],
  leadership: [["HQ", [["/dashboard", "Overview"], ["/final-results", "Final results"], ["/entries", "Artworks"], ["/schools", "Schools"], ["/students", "Students"], ["/reports", "Reports"]]]]
};
