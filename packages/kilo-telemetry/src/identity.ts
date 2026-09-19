import * as path from "path"

export namespace Identity {
  let machineId: string | null = null
  let userId: string | null = null
  let organizationId: string | null = null
  let dataPath = ""

  export function setDataPath(p: string) {
    dataPath = p
  }

  export async function getMachineId(): Promise<string | undefined> {
    if (machineId) return machineId
    const override = process.env.KILO_MACHINE_ID
    if (override) {
      machineId = override
      return machineId
    }

    if (!dataPath) return undefined

    const filepath = path.join(dataPath, "telemetry-id")
    const file = Bun.file(filepath)

    if (await file.exists()) {
      machineId = await file.text()
      return machineId
    }

    machineId = crypto.randomUUID()
    await Bun.write(filepath, machineId)
    return machineId
  }

  export function getDistinctId(): string {
    return userId || machineId || "unknown"
  }

  export function getUserId(): string | null {
    return userId
  }

  export function getOrganizationId(): string | null {
    return organizationId
  }

  export function setOrganizationId(orgId: string | null) {
    organizationId = orgId
  }

  /**
   * Update telemetry identity from the local authentication state.
   *
   * The previous implementation queried Kilo Gateway for an email address.
   * AGENTXCODE has no equivalent Gateway identity service, so telemetry remains
   * machine-scoped unless an identity is supplied by a future provider integration.
   */
  export async function updateFromKiloAuth(_token: string | null, accountId?: string): Promise<void> {
    organizationId = accountId || null
    userId = null
  }

  export function reset() {
    userId = null
    organizationId = null
  }
}
