import Courses from '@/components/Courses';
import Hero from '@/components/Hero';
import React from 'react'

const HomePage = () => {
  return (
    <section className='flex flex-col'>
        <Hero />
        <Courses />
    </section>
  )
};

export default HomePage