'use client';

import React from 'react';
import { TrackingView } from '../components/TrackingView';

export default function TrackingPage({
  searchParams,
}: {
  searchParams?: { id?: string; code?: string };
}) {
  const initialCode = searchParams?.code || searchParams?.id || '';
  return <TrackingView initialId={initialCode} />;
}
