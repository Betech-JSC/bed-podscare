'use client';

import React from 'react';
import { TrackingView } from '../components/TrackingView';

export default function TrackingPage({
  searchParams,
}: {
  searchParams?: { id?: string };
}) {
  return <TrackingView initialId={searchParams?.id} />;
}
