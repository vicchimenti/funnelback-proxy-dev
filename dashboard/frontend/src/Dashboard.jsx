import React, { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://funnelback-proxy.vercel.app/api/analytics';

// Dashboard Layout Component
const Dashboard = () => {
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
    endDate: new Date().toISOString().split('T')[0] // today
  });
  
  const [selectedHandler, setSelectedHandler] = useState('all');
  const [summaryData, setSummaryData] = useState(null);
  const [trendData, setTrendData] = useState([]);
  const [topQueries, setTopQueries] = useState([]);
  const [zeroResultQueries, setZeroResultQueries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Handler options - make dynamic later
  const handlerOptions = [
    { value: 'all', label: 'All Handlers' },
    { value: 'suggest', label: 'Autocomplete Suggestions' },
    { value: 'suggestPeople', label: 'People Suggestions' },
    { value: 'suggestPrograms', label: 'Program Suggestions' },
    { value: 'search', label: 'Search Results' },
    { value: 'spelling', label: 'Spelling Suggestions' }
  ];
  
  // Authentication headers
  const authHeaders = {
    'Authorization': `Basic ${btoa(`${process.env.REACT_APP_USERNAME || 'admin'}:${process.env.REACT_APP_PASSWORD || 'password'}`)}`
  };
  
  // Fetch dashboard data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Build query params
        const params = new URLSearchParams({
          startDate: dateRange.startDate,
          endDate: dateRange.endDate
        });
        
        if (selectedHandler !== 'all') {
          params.append('handler', selectedHandler);
        }
        
        // Fetch summary data
        const summaryResponse = await fetch(`${API_BASE_URL}/summary?${params}`, {
          headers: authHeaders
        });
        
        if (!summaryResponse.ok) {
          throw new Error(`Error fetching summary data: ${summaryResponse.statusText}`);
        }
        
        const summaryJson = await summaryResponse.json();
        setSummaryData(summaryJson);
        
        // Fetch trend data
        const trendResponse = await fetch(`${API_BASE_URL}/trends?${params}&interval=day`, {
          headers: authHeaders
        });
        
        if (!trendResponse.ok) {
          throw new Error(`Error fetching trend data: ${trendResponse.statusText}`);
        }
        
        const trendJson = await trendResponse.json();
        
        // Format trend data for charts
        const formattedTrendData = trendJson.map(item => ({
          date: `${item._id.month}/${item._id.day}`,
          queries: item.count,
          withResults: item.queriesWithResults,
          withoutResults: item.queriesWithoutResults,
          avgResponseTime: Math.round(item.averageResponseTime),
          avgResults: Math.round(item.averageResultCount * 10) / 10
        }));
        
        setTrendData(formattedTrendData);
        
        // Fetch top queries
        const topQueriesResponse = await fetch(`${API_BASE_URL}/top-queries?${params}&limit=20`, {
          headers: authHeaders
        });
        
        if (!topQueriesResponse.ok) {
          throw new Error(`Error fetching top queries: ${topQueriesResponse.statusText}`);
        }
        
        const topQueriesJson = await topQueriesResponse.json();
        setTopQueries(topQueriesJson);
        
        // Fetch zero result queries
        const zeroResultResponse = await fetch(`${API_BASE_URL}/zero-results?${params}&limit=20`, {
          headers: authHeaders
        });
        
        if (!zeroResultResponse.ok) {
          throw new Error(`Error fetching zero result queries: ${zeroResultResponse.statusText}`);
        }
        
        const zeroResultJson = await zeroResultResponse.json();
        setZeroResultQueries(zeroResultJson);
        
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [dateRange, selectedHandler]);
  
  // Handle date range changes
  const handleDateRangeChange = (event) => {
    setDateRange({
      ...dateRange,
      [event.target.name]: event.target.value
    });
  };
  
  // Handle handler selection change
  const handleHandlerChange = (event) => {
    setSelectedHandler(event.target.value);
  };
  
  // Export data function
  const handleExport = async (format = 'csv') => {
    try {
      // Build query params
      const params = new URLSearchParams({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        format
      });
      
      if (selectedHandler !== 'all') {
        params.append('handler', selectedHandler);
      }
      
      // For CSV, trigger download
      if (format === 'csv') {
        window.location.href = `${API_BASE_URL}/export?${params}`;
      } else {
        // For JSON, open in new tab
        window.open(`${API_BASE_URL}/export?${params}`, '_blank');
      }
    } catch (err) {
      console.error('Error exporting data:', err);
      setError(err.message);
    }
  };
  
  if (loading) {
    return <div className="loading">Loading dashboard data...</div>;
  }
  
  if (error) {
    return <div className="error">Error: {error}</div>;
  }
  
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Funnelback Query Analytics Dashboard</h1>
        
        <div className="dashboard-controls">
          <div className="date-range">
            <label>
              Start Date:
              <input 
                type="date" 
                name="startDate" 
                value={dateRange.startDate} 
                onChange={handleDateRangeChange} 
              />
            </label>
            
            <label>
              End Date:
              <input 
                type="date" 
                name="endDate" 
                value={dateRange.endDate} 
                onChange={handleDateRangeChange} 
              />
            </label>
          </div>
          
          <div className="handler-selector">
            <label>
              Handler:
              <select value={selectedHandler} onChange={handleHandlerChange}>
                {handlerOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          
          <div className="export-controls">
            <button onClick={() => handleExport('csv')}>Export CSV</button>
            <button onClick={() => handleExport('json')}>Export JSON</button>
          </div>
        </div>
      </header>
      
      {summaryData && (
        <div className="summary-cards">
          <div className="card">
            <h3>Total Queries</h3>
            <div className="card-value">{summaryData.summary.totalQueries.toLocaleString()}</div>
          </div>
          
          <div className="card">
            <h3>Avg Response Time</h3>
            <div className="card-value">{Math.round(summaryData.summary.averageResponseTime)}ms</div>
          </div>
          
          <div className="card">
            <h3>Success Rate</h3>
            <div className="card-value">
              {Math.round((summaryData.summary.queriesWithResults / summaryData.summary.totalQueries) * 100)}%
            </div>
          </div>
          
          <div className="card">
            <h3>Avg Results</h3>
            <div className="card-value">{Math.round(summaryData.summary.averageResultCount * 10) / 10}</div>
          </div>
        </div>
      )}
      
      <div className="chart-container">
        <h2>Query Volume Trends</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="queries" stroke="#8884d8" name="Total Queries" />
            <Line type="monotone" dataKey="withResults" stroke="#82ca9d" name="With Results" />
            <Line type="monotone" dataKey="withoutResults" stroke="#ff8042" name="Zero Results" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      <div className="chart-container">
        <h2>Response Time & Results</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip />
            <Legend />
            <Line yAxisId="left" type="monotone" dataKey="avgResponseTime" stroke="#8884d8" name="Avg Response Time (ms)" />
            <Line yAxisId="right" type="monotone" dataKey="avgResults" stroke="#82ca9d" name="Avg Results" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      <div className="data-tables">
        <div className="table-container">
          <h2>Top Queries</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Query</th>
                <th>Count</th>
                <th>Avg Results</th>
                <th>Success Rate</th>
              </tr>
            </thead>
            <tbody>
              {topQueries.map(query => (
                <tr key={query._id}>
                  <td>{query._id}</td>
                  <td>{query.count}</td>
                  <td>{Math.round(query.averageResultCount * 10) / 10}</td>
                  <td>{Math.round(query.successRate * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="table-container">
          <h2>Zero Result Queries</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Query</th>
                <th>Count</th>
                <th>Last Searched</th>
                <th>Handlers</th>
              </tr>
            </thead>
            <tbody>
              {zeroResultQueries.map(query => (
                <tr key={query._id}>
                  <td>{query._id}</td>
                  <td>{query.count}</td>
                  <td>{new Date(query.lastSearched).toLocaleDateString()}</td>
                  <td>{query.handlers.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;