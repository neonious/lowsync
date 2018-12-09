###################
Start
###################

Name
==================

lowsync-start - Start the program

Synopsis
==================

.. code-block:: bash

    lowsync start [file] [--force]

Description
==================

Starts the program on the device.

The file is the entry point of the program and must exist if given. If the integrated transpilation feature is turned off, the user must specify a valid EcmaScript 5 file. See :doc:`/commands/commands/sync` command for more information.

If a file is not specified, the file in the settings (code.main key) is used.

Options
==================

.. code-block:: bash

    --force

Force a restart of the program if it is currently running.

Examples
==================

.. code-block:: bash

    lowsync start /src/index.js

Starts */src/index.js* and fails if a program is already running.

.. code-block:: bash

    lowsync start "/src/an example.js" --force

Starts */src/an example.js* and will stop a currently running program beforehand.