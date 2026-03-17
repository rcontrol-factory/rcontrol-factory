async function runSelfEvolution(){

  const snapshot = RCF_CONTEXT.getSnapshot()

  const plan = RCF_FACTORY_AI_PLANNER.planFromRuntime({
    goal: "evolve factory ai"
  })

  const response = await callAdminAI({
    action: "propose-patch",
    payload: {
      snapshot,
      plan
    }
  })

  if(response.hints.hasCodeBlock){
    RCF_PATCH_SUPERVISOR.stagePatch(response)
  }

}
