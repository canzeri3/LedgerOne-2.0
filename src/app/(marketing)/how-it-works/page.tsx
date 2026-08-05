'use client'

import { L1Nightsky, L1Grain, L1Footer } from '@/components/ledgerone'
import { HOW_IT_WORKS_HTML } from './content'
import './how-it-works.css'

export default function HowItWorksPage() {
  return (
    <>
      <L1Nightsky />
      <L1Grain />
      <div dangerouslySetInnerHTML={{ __html: HOW_IT_WORKS_HTML }} />
      <L1Footer />
    </>
  )
}
