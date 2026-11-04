import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  getHealth,
  runVVSelfTest,
  runVVPipeline,
  validateCDM,
  type HealthStatus,
  type SelfTestResponse,
  type PipelineResponse,
  type PipelineRequest,
  type CDMValidationResponse,
  DEFAULT_PIPELINE_REQUEST,
} from '../../lib/apiClient';
import { VVHeaderStatus } from './VVHeaderStatus';
import { SelfTestPanel } from './SelfTestPanel';
import { PipelinePanel } from './PipelinePanel';
import { CDMValidatorPanel } from './CDMValidatorPanel';
import { EPGGraph } from './EPGGraph';

export const VerificationDashboard: React.FC = () => {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [activeTab, setActiveTab] = useState<'pipeline' | 'epg' | 'selftest' | 'cdm' | 'all'>('pipeline');

  // Compute provenance states
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [lastRunTimestamp, setLastRunTimestamp] = useState<string | null>(null);
  const [lastRoundTripMs, setLastRoundTripMs] = useState<number | null>(null);

  // Panel data states
  const [selfTestData, setSelfTestData] = useState<SelfTestResponse | null>(null);
  const [selfTestLoading, setSelfTestLoading] = useState<boolean>(false);

  const [pipelineData, setPipelineData] = useState<PipelineResponse | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState<boolean>(false);

  const [cdmData, setCdmData] = useState<CDMValidationResponse | null>(null);
  const [cdmLoading, setCdmLoading] = useState<boolean>(false);

  const initialRunTriggeredRef = useRef(false);

  // Poll Health status
  const pollHealth = useCallback(async () => {
    const h = await getHealth();
    setHealth(h);
    return h?.status === 'ok';
  }, []);

  useEffect(() => {
    pollHealth();
    const interval = setInterval(pollHealth, 10000);
    return () => clearInterval(interval);
  }, [pollHealth]);

  const isOnline = health?.status === 'ok';

  // Handler: Run Verification Suite
  const handleRunSelfTest = useCallback(async () => {
    setSelfTestLoading(true);
    const t0 = performance.now();
    try {
      const res = await runVVSelfTest();
      const rtt = performance.now() - t0;
      setLastRoundTripMs(rtt);
      if (res) {
        setSelfTestData(res);
        setLastRunId(res.run_id);
        setLastRunTimestamp(res.timestamp);
      }
    } finally {
      setSelfTestLoading(false);
    }
  }, []);

  // Handler: Run Evasion Pipeline
  const handleRunPipeline = useCallback(async (req: PipelineRequest) => {
    setPipelineLoading(true);
    const t0 = performance.now();
    try {
      const res = await runVVPipeline(req);
      const rtt = performance.now() - t0;
      setLastRoundTripMs(rtt);
      if (res) {
        setPipelineData(res);
        setLastRunId(res.run_id);
        setLastRunTimestamp(res.timestamp);
      }
    } finally {
      setPipelineLoading(false);
    }
  }, []);

  // Handler: Validate CDM
  const handleValidateCDM = useCallback(async (cdmText: string) => {
    setCdmLoading(true);
    const t0 = performance.now();
    try {
      const res = await validateCDM(cdmText);
      const rtt = performance.now() - t0;
      setLastRoundTripMs(rtt);
      if (res) {
        setCdmData(res);
      }
    } finally {
      setCdmLoading(false);
    }
  }, []);

  // Trigger initial computations when backend becomes online
  useEffect(() => {
    if (isOnline && !initialRunTriggeredRef.current) {
      initialRunTriggeredRef.current = true;
      handleRunPipeline(DEFAULT_PIPELINE_REQUEST);
      handleRunSelfTest();
    }
  }, [isOnline, handleRunPipeline, handleRunSelfTest]);

  const uptimeSec = health ? Math.max(0, Math.round(health.uptime)) : 0;

  return (
    <div className="w-full space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Provenance & Health Header */}
      <VVHeaderStatus
        isOnline={isOnline}
        uptimeSec={uptimeSec}
        lastRunId={lastRunId}
        lastRunTimestamp={lastRunTimestamp}
        lastRoundTripMs={lastRoundTripMs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Main Panels according to active tab */}
      {(activeTab === 'pipeline' || activeTab === 'all') && (
        <PipelinePanel
          data={pipelineData}
          loading={pipelineLoading}
          onRunPipeline={handleRunPipeline}
          isBackendOnline={isOnline}
        />
      )}

      {(activeTab === 'epg' || activeTab === 'all') && (
        <EPGGraph
          pipelineData={pipelineData}
          isBackendOnline={isOnline}
        />
      )}

      {(activeTab === 'selftest' || activeTab === 'all') && (
        <SelfTestPanel
          data={selfTestData}
          loading={selfTestLoading}
          onRunTest={handleRunSelfTest}
          isBackendOnline={isOnline}
        />
      )}

      {(activeTab === 'cdm' || activeTab === 'all') && (
        <CDMValidatorPanel
          data={cdmData}
          loading={cdmLoading}
          onValidate={handleValidateCDM}
          isBackendOnline={isOnline}
        />
      )}
    </div>
  );
};

export default VerificationDashboard;
