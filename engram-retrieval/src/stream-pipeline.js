export const STREAM_PIPELINE_VERSION = "engram-context-v1";
export function contextStreamPipeline({ connectionName = "engramAtlas", database = "engram" } = {}) {
  for (const value of [connectionName, database]) if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error("Invalid stream connection/database name");
  return [
    { $source: { connectionName, db: database, coll: "context_events", config: { fullDocument: "updateLookup" } } },
    { $match: { operationType: "insert", "fullDocument.type": "place_check_in" } },
    { $replaceRoot: { newRoot: "$fullDocument" } },
    { $match: { _id: { $type: "string" }, householdId: { $type: "string" }, subjectId: { $type: "string" }, placeId: { $type: "string" }, observedAt: { $type: "date" } } },
    { $lookup: {
      from: { connectionName, db: database, coll: "plans" },
      let: { household: "$householdId", subject: "$subjectId", place: "$placeId", observed: "$observedAt" },
      pipeline: [{ $match: { $expr: { $and: [
        { $eq: ["$householdId", "$$household"] }, { $eq: ["$subjectId", "$$subject"] },
        { $eq: ["$placeId", "$$place"] }, { $eq: ["$triggerType", "context"] },
        { $eq: ["$reviewStatus", "approved"] }, { $eq: ["$eventStatus", "planned"] },
        { $lte: ["$eventStart", "$$observed"] }, { $gt: ["$expiresAt", "$$observed"] }
      ] } } }, { $limit: 1 }], as: "matchingPlans"
    } },
    { $match: { "matchingPlans.0": { $exists: true } } },
    { $set: { status: "pending", processingPath: "atlas_stream_processing", pipelineVersion: STREAM_PIPELINE_VERSION } },
    { $unset: "matchingPlans" },
    { $merge: { into: { connectionName, db: database, coll: "assistance_candidates" }, on: "_id", whenMatched: "keepExisting", whenNotMatched: "insert" } }
  ];
}
