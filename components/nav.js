// Role navigation. Shared by the server (home redirect) and the client shell.
export const HOME = { admin: "/dashboard", coordinator: "/dashboard", evaluator: "/queue", management: "/dashboard", storage: "/dashboard", leadership: "/dashboard" };
export const NAV = {
  admin: [
    ["Overview", [["/dashboard", "Dashboard"]]],
    ["Setup", [["/setup", "Program setup"], ["/rubrics", "Rubric library"], ["/import", "Data import"], ["/people", "People and logins"]]],
    ["Operations", [["/entries", "Entries"], ["/files", "Submission files"], ["/allocation", "Allocation"], ["/rounds", "Rounds and results"], ["/sessions", "Scoring sessions"], ["/reviews", "Reviews", "reviews"], ["/logistics", "Artwork logistics"]]],
    ["Insights", [["/insights", "Insights"], ["/reports", "Reports and exports"], ["/final-results", "Final results"], ["/audit", "Audit log"]]]
  ],
  coordinator: [
    ["Work", [["/dashboard", "My dashboard"], ["/sessions", "Scoring sessions"], ["/entries", "My entries"], ["/entries?scope=all", "All entries"]]],
    ["Artwork", [["/collections", "Collections"], ["/logistics", "Artwork logistics"]]]
  ],
  evaluator: [["Scoring", [["/queue", "My queue", "queue"]]]],
  storage: [["Storage", [["/dashboard", "Dashboard"], ["/logistics", "Logistics board"], ["/pull-list", "Pull lists"], ["/collections", "Collections"], ["/exceptions", "Exceptions"]]]],
  management: [["Review", [["/dashboard", "Dashboard"], ["/reviews?mine=1", "My reviews", "reviews"], ["/entries", "Entries"]]], ["Insights", [["/insights", "Insights"], ["/final-results", "Final results"], ["/reports", "Reports"]]]],
  leadership: [["HQ", [["/dashboard", "Overview"], ["/reviews", "Reviews"], ["/final-results", "Final results"], ["/entries", "Entries"], ["/reports", "Reports"]]]]
};
