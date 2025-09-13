import React from "react";

export default function Planner() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="mb-6 text-2xl font-semibold">Planner</h1>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <section className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-medium">Buy Planner</h2>
          <form className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="buy-asset">
                Asset
              </label>
              <input
                id="buy-asset"
                type="text"
                className="mt-1 w-full rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="buy-quantity">
                Quantity
              </label>
              <input
                id="buy-quantity"
                type="number"
                className="mt-1 w-full rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="buy-price">
                Price
              </label>
              <input
                id="buy-price"
                type="number"
                step="0.01"
                className="mt-1 w-full rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-blue-600 p-2 text-white transition hover:bg-blue-700"
            >
              Save
            </button>
          </form>
        </section>
        <section className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-medium">Sell Planner</h2>
          <form className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="sell-asset">
                Asset
              </label>
              <input
                id="sell-asset"
                type="text"
                className="mt-1 w-full rounded-md border border-gray-300 p-2 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="sell-quantity">
                Quantity
              </label>
              <input
                id="sell-quantity"
                type="number"
                className="mt-1 w-full rounded-md border border-gray-300 p-2 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700" htmlFor="sell-price">
                Price
              </label>
              <input
                id="sell-price"
                type="number"
                step="0.01"
                className="mt-1 w-full rounded-md border border-gray-300 p-2 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-green-600 p-2 text-white transition hover:bg-green-700"
            >
              Save
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

