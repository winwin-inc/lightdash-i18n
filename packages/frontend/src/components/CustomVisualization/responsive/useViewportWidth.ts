import { useEffect, useState } from 'react';

function getViewportWidth(): number {
    if (typeof window === 'undefined') {
        return Number.POSITIVE_INFINITY;
    }
    return window.innerWidth;
}

/** 监听页面视口宽度（用于 responsive breakpoint 判断） */
export function useViewportWidth(): number {
    const [viewportWidth, setViewportWidth] = useState(getViewportWidth);

    useEffect(() => {
        const handleResize = () => {
            setViewportWidth(getViewportWidth());
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return viewportWidth;
}
