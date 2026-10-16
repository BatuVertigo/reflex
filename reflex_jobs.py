"""Job records for the ops dashboard: every request a Reflex service handles is one job that goes
started → (progress) → finished / failed. Each process keeps its own JSON file under REFLEX_LOG_DIR
(default ~/Library/Logs/Reflex), so two processes never write the same file.

Nothing personal goes in here: Stats passes only the query kind, never a PlayFab ID or match ID.
"""

import json
import os
import threading
import time
import uuid

LOG_DIR = os.path.expanduser(os.environ.get("REFLEX_LOG_DIR") or "~/Library/Logs/Reflex")
KEEP = 5000


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


class Jobs:
    def __init__(self, name):
        os.makedirs(LOG_DIR, exist_ok=True)
        self.path = os.path.join(LOG_DIR, f"jobs-{name}.json")
        self.lock = threading.Lock()
        self.jobs = []
        try:
            with open(self.path, encoding="utf-8") as file:
                self.jobs = json.load(file)["jobs"]
        except (OSError, ValueError, KeyError):
            pass
        # A job still "running" from before this start was cut off by a restart.
        for job in self.jobs:
            if job["status"] == "running":
                job.update(status="failed", detail="process restarted", updated=now())
        self._save()

    def start(self, feature, user="", detail="", link="", group=""):
        """link: where the dashboard sends the reader (Slack thread, Asana task). group: id shared by the stages of one request."""
        job = {"id": uuid.uuid4().hex[:8], "feature": feature, "user": user, "started": now(), "updated": now(),
               "status": "running", "progress": "", "detail": detail, "link": link, "group": group}
        with self.lock:
            self.jobs.append(job)
            del self.jobs[:-KEEP]
            self._save()
        return job["id"]

    def update(self, job_id, progress=None, detail=None):
        self._set(job_id, progress=progress, detail=detail)

    def finish(self, job_id, status="finished", detail=None):
        self._set(job_id, status=status, detail=detail)

    def _set(self, job_id, **fields):
        with self.lock:
            for job in self.jobs:
                if job["id"] == job_id:
                    job.update({key: value for key, value in fields.items() if value is not None}, updated=now())
                    break
            self._save()

    def _save(self):
        temporary = self.path + ".tmp"
        with open(temporary, "w", encoding="utf-8") as file:
            json.dump({"jobs": self.jobs}, file, ensure_ascii=False)
        os.replace(temporary, self.path)
