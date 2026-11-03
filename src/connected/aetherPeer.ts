import type { Status, PeerCapabilities, SandboxInput, SandboxOutput, PeerTrainingInput, PeerJob, PeerCancellation, PeerAdmissionInput, PeerAdmission } from '../contracts/v1/aether-playground';

export interface AetherPeer {
  readonly connectionId: string | null;
  readonly serverId: string;
  status(): Promise<Status>;
  capabilities(): Promise<PeerCapabilities>;
  sandbox(input: SandboxInput, requestId: string, actor: string): Promise<SandboxOutput>;
  submitTraining(input: PeerTrainingInput): Promise<PeerJob>;
  trainingStatus(requestId: string): Promise<PeerJob | null>;
  cancelTraining(requestId: string): Promise<PeerCancellation>;
  admission(input: PeerAdmissionInput): Promise<PeerAdmission>;
}
