// Fictional text fixtures only. No real recordings, clinical data or simulated vectors.
export async function seedDemo(service) {
  const subjectId = service.cfg.subjectIds[0];
  const now = service.clock();
  const personId = `priya_${now.getTime()}`;
  const sourceId = `visit_source_${now.getTime()}`;
  const episodeId = `visit_episode_${now.getTime()}`;
  await service.addPerson({ id: personId, subjectId, name: "Priya", relationship: "granddaughter" });
  await service.addSource({ id: sourceId, subjectId, sourceType: "caregiver_report",
    content: "DEMO caregiver report: Priya visited with yellow flowers. Margaret and Priya had tea in the living room." });
  await service.addEpisode({ id: episodeId, subjectId, sourceIds: [sourceId], personIds: [personId],
    summary: "Priya visited with yellow flowers and had tea in the living room.",
    eventStart: new Date(+now - 86400000).toISOString(), reviewStatus: "approved" });
  await service.addSource({ id: `glasses_source_${+now}`, subjectId, sourceType: "user_report",
    content: "DEMO user report: I left my glasses on the bookshelf by the window." });
  await service.addEpisode({ id: `glasses_episode_${+now}`, subjectId,
    sourceIds: [`glasses_source_${+now}`], summary: "Glasses last reported on the bookshelf by the window.",
    eventStart: new Date(+now - 3600000).toISOString(), reviewStatus: "approved" });
  const plan = await service.createPlan({ id: `demo_visit_${+now}`, subjectId, kind: "visit", personId,
    eventStart: new Date(+now + 120000).toISOString(), dueAt: new Date(+now + 15000).toISOString(),
    expiresAt: new Date(+now + 300000).toISOString() });
  const intention = await service.createPlan({ id: `demo_album_${+now}`, subjectId, kind: "photo_album", triggerType: "context",
    placeId: "desk", eventStart: now.toISOString(), expiresAt: new Date(+now + 600000).toISOString() });
  return { subjectId, personId, episodeId, plan, intention, note: "Fictional text evidence. Reminder due in 15 seconds; quiet hours and cooldown remain active." };
}
