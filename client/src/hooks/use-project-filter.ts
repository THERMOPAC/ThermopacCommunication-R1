import { useState, useMemo } from "react";

export function useProjectFilter(projects: any[], selectedProjectId?: number | null) {
  const [showAllProjects, setShowAllProjects] = useState(false);

  const filteredProjects = useMemo(() => {
    if (showAllProjects) return projects;
    const activeList = projects.filter((p: any) => p.status === "active");
    if (selectedProjectId && !activeList.find((p: any) => p.id === selectedProjectId)) {
      const selected = projects.find((p: any) => p.id === selectedProjectId);
      if (selected) return [...activeList, selected];
    }
    return activeList;
  }, [projects, showAllProjects, selectedProjectId]);

  return { showAllProjects, setShowAllProjects, filteredProjects };
}
