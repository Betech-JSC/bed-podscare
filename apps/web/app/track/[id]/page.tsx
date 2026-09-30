'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { TrackingView } from '../../components/TrackingView';

export default function TrackByIdPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : undefined;
  return <TrackingView initialId={id} />;
}
