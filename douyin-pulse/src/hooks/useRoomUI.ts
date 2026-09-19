import { useState, useEffect } from 'react';
import { SearchTarget } from '@/types/room';
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

export function useRoomUI() {
    const [searchTarget, setSearchTarget] = useState<SearchTarget>('all');
    const [inputSearch, setInputSearch] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const [searchTrigger, setSearchTrigger] = useState(0);    
    const [minPriceInput, setMinPriceInput] = useState(1000);
    const [enableMinPrice, setEnableMinPrice] = useState(false);

    const [filterGender, setFilterGender] = useState<number | null>(null); 
    const [filterMinPayGrade, setFilterMinPayGrade] = useState(0); 
    const [filterMinFansLevel, setFilterMinFansLevel] = useState(0); 
    
    const [filterStartTime, setFilterStartTime] = useState('');
    const [filterEndTime, setFilterEndTime] = useState('');

    // 核心：监听时间输入框，并在停手 800 毫秒后才会更新到请求体
    const debouncedFilterStartTime = useDebounce(filterStartTime, 800);
    const debouncedFilterEndTime = useDebounce(filterEndTime, 800);

    const [desktopTab, setDesktopTab] = useState<'chat' | 'pk'>('chat');
    const [mobileTab, setMobileTab] = useState<'chat' | 'gift' | 'pk'>('chat');
    const [isStatsOpen, setIsStatsOpen] = useState(false);

    const handleSearch = () => { 
        setAppliedSearch(inputSearch); 
        setSearchTrigger(prev => prev + 1);
    };
    const handleReset = () => { 
        setInputSearch(''); 
        setAppliedSearch('');
        setEnableMinPrice(false);
        setFilterGender(null);
        setFilterMinPayGrade(0);
        setFilterMinFansLevel(0);
        setFilterStartTime('');
        setFilterEndTime('');
    };
    
    const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); };

    return {
        searchState: {
            searchTarget, setSearchTarget,
            inputSearch, setInputSearch,
            appliedSearch,
            minPriceInput, setMinPriceInput,
            enableMinPrice, setEnableMinPrice,
            filterGender, setFilterGender,
            filterMinPayGrade, setFilterMinPayGrade,
            filterMinFansLevel, setFilterMinFansLevel,
            filterStartTime, setFilterStartTime,
            filterEndTime, setFilterEndTime,
            searchTrigger,
            debouncedFilterStartTime,
            debouncedFilterEndTime
        },
        tabState: { desktopTab, setDesktopTab, mobileTab, setMobileTab },
        modalState: { isStatsOpen, setIsStatsOpen },
        actions: { handleSearch, handleReset, handleKeyDown }
    };
}