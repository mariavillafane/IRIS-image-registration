import { useState, useEffect } from "react";
import { fetchJobs } from "./actions";
import type { JobQueueSummary } from "../types";

export function useJobQueue(pollInterval = 5000): JobQueueSummary {
  const [jobQueue, setJobQueue] = useState<JobQueueSummary>({
    done: 0,
    queued: 0,
    inProgress: 0,
    total: 0,
    failed: 0,
    jobs: {},
    jobsByProject: {},
  });

  useEffect(() => {
    fetchJobs().then(setJobQueue);
    const h = setInterval(() => fetchJobs().then(setJobQueue), pollInterval);

    return () => {
      clearInterval(h);
    };
  }, [pollInterval]);

  return jobQueue;
}
