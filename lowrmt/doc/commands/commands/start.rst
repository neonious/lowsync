###################
Start
###################

Name
==================

lowrmt-start - Start the program

Synopsis
==================

.. code-block:: bash

    lowrmt start <file> [--force]

Description
==================

Starts the program on the device. Will fail if it is already running, unless the :code:`--force` option is given.

The file is the entry point of the program and must exist. If the integrated transpilation feature is turned off, the user must specify a valid EcmaScript 5 file. See :doc:`/commands/commands/sync` command for more information.

Options
==================

.. code-block:: bash

    --force

Restart the program if it is currently running (no error).

Examples
==================

.. code-block:: bash

    lowrmt start /src/index.js

Starts */src/index.js* and fails if a program is already running.

.. code-block:: bash

    lowrmt start "/src/an example.js" --force

Starts */src/an example.js* and will stop a currently running program beforehand.