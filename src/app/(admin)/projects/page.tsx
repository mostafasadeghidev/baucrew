import { ProjectsBoard, type ProjectsSearchParams } from './projects-board'

/** Projekte: every board as a tab, each as a board or as a list (projects-board.tsx). */
export default function ProjectsPage({ searchParams }: { searchParams: Promise<ProjectsSearchParams> }) {
  return <ProjectsBoard searchParams={searchParams} />
}
