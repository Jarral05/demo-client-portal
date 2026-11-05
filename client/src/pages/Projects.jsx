import { useApi } from '../api.js';
import { Loader, PageTitle } from '../components/ui.jsx';
import { ProjectCard } from './Overview.jsx';

export function Projects() {
  const state = useApi('/projects');
  return (
    <>
      <PageTitle title="Projects" />
      <Loader state={state}>
        {(projects) => (
          <div className="grid">
            {projects.map((project) => <ProjectCard key={project._id} project={project} />)}
          </div>
        )}
      </Loader>
    </>
  );
}
